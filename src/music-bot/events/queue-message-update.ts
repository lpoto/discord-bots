import {
    ButtonInteraction,
    CommandInteraction,
    Guild,
    InteractionReplyOptions,
    Message,
    MessageActionRow,
    MessageButton,
    MessageSelectMenu,
    NonThreadGuildBasedChannel,
    PartialMessage,
    SelectMenuInteraction,
    StartThreadOptions,
    TextBasedChannel,
    TextChannel,
    ThreadChannel,
} from 'discord.js';
import { Command, QueueEmbedOptions, UpdateQueueOptions } from '../music-bot';
import { MusicClient } from '../client';
import { Queue } from '../entities';
import { QueueEmbed } from '../utils';
import * as Commands from '../commands';
import { AbstractMusicEvent } from '../utils/abstract-music-event';

export class OnQueueMessageUpdate extends AbstractMusicEvent {
    public needsClientReady = false;
    private toDefer: {
        [guildId: string]: (ButtonInteraction | SelectMenuInteraction)[];
    };
    private callbacks: {
        [guildId: string]: (() => Promise<void>)[];
    };
    private errorCallbacks: {
        [guildId: string]: (() => Promise<void>)[];
    };
    private updatingOptions: { [guildId: string]: UpdateQueueOptions };

    public constructor(client: MusicClient) {
        super(client);
        this.toDefer = {};
        this.updatingOptions = {};
        this.callbacks = {};
        this.errorCallbacks = {};
    }

    public async callback(options: UpdateQueueOptions): Promise<void> {
        if (
            (options.openThread || options.openThreadOnly) &&
            options.message
        ) {
            const r: ThreadChannel | undefined = await this.startThread(
                options.message,
            );
            if (r) {
                options.queue.threadId = r.id;
                options.queue = await options.queue.save();
            }
            if (options.openThreadOnly) return;
        }
        if (
            (options.interaction && options.interaction.isCommand()) ||
            (options.resend &&
                (options.message ||
                    (options.interaction && options.interaction.isButton())))
        )
            return this.newQueueMessage(options);

        const guildId: string = options.queue.guildId;

        if (options.checkIfUpdated && this.client.alreadyUpdated(guildId)) {
            this.client.setAlreadyUpdated(guildId, false);
            if (options.onError) options.onError();
            return;
        }

        if (!options.checkIfUpdated && options.doNotSetUpdated) {
            this.client.setAlreadyUpdated(guildId, false);
        }

        if (options.onUpdate) {
            if (!(guildId in this.callbacks)) this.callbacks[guildId] = [];
            this.callbacks[guildId].push(options.onUpdate);
        }

        if (options.onError) {
            if (!(guildId in this.errorCallbacks))
                this.errorCallbacks[guildId] = [];
            this.errorCallbacks[guildId].push(options.onError);
        }

        if (guildId in this.updatingOptions) {
            if (options.message && !this.updatingOptions[guildId].message)
                this.updatingOptions[guildId].message = options.message;
            if (!options.embedOnly)
                this.updatingOptions[guildId].embedOnly = false;
            if (options.interaction)
                if (!this.updatingOptions[guildId].interaction) {
                    this.updatingOptions[guildId].interaction =
                        options.interaction;
                } else {
                    if (!(guildId in this.toDefer)) this.toDefer[guildId] = [];
                    this.toDefer[guildId].push(options.interaction);
                }
            return;
        }
        this.updatingOptions[guildId] = options;

        const timeout: NodeJS.Timeout = setTimeout(
            async () => {
                if (!this.updatingOptions[guildId]) return;
                await this.update(this.updatingOptions[guildId])
                    .then(() => {
                        if (!this.updatingOptions[guildId].doNotSetUpdated)
                            this.client.setAlreadyUpdated(guildId, true);

                        if (guildId in this.toDefer) {
                            for (const i of this.toDefer[guildId])
                                i.deferUpdate().catch((e) => {
                                    this.client.emit('error', e);
                                });
                            delete this.toDefer[guildId];
                        }
                        if (guildId in this.updatingOptions)
                            delete this.updatingOptions[guildId];
                    })
                    .catch((e) => {
                        this.handleErrorCallbacks(guildId);

                        if (guildId in this.updatingOptions)
                            delete this.updatingOptions[guildId];
                        if (guildId in this.callbacks) {
                            for (const c of this.callbacks[guildId])
                                c().catch((e2) => {
                                    this.client.emitEvent('error', e2);
                                });
                            delete this.callbacks[guildId];
                        }
                        this.client.emit('error', e);
                    });
            },
            options.timeout ? options.timeout : 150,
        );
        timeout.unref();
    }

    private async update(options: UpdateQueueOptions): Promise<void> {
        await options.queue.reload();

        const updateOptions: InteractionReplyOptions =
            this.getQueueOptions(options);

        const interaction:
            | ButtonInteraction
            | CommandInteraction
            | SelectMenuInteraction
            | undefined = options.interaction;

        if (
            interaction &&
            (interaction instanceof ButtonInteraction ||
                interaction instanceof SelectMenuInteraction) &&
            !interaction.deferred &&
            !interaction.replied
        ) {
            return interaction
                .update(updateOptions)
                .then(() => {
                    this.handleCallbacks(options.queue.guildId);
                })
                .catch((error) => {
                    this.handleErrorCallbacks(options.queue.guildId);
                    this.client.emit('error', error);
                });
        }
        if (options.message) {
            options.message
                .edit(updateOptions)
                .then(() => {
                    this.handleCallbacks(options.queue.guildId);
                })
                .catch((e) => {
                    this.client.emit('error', e);
                    this.handleErrorCallbacks(options.queue.guildId);
                });
            return;
        }

        const guild: Guild = await this.client.guilds.fetch(
            options.queue.guildId,
        );
        if (!guild) return;
        const channel: NonThreadGuildBasedChannel | null =
            await guild.channels.fetch(options.queue.channelId);
        if (!channel || !channel.isText()) return;
        const thread: ThreadChannel | null = await channel.threads.fetch(
            options.queue.threadId,
        );
        if (!thread) return;
        return await thread
            .fetchStarterMessage()
            .then(async (message) => {
                if (!message) return;
                await options.queue.reload();
                const qOptions = this.getQueueOptions(options);
                message
                    .edit(qOptions)
                    .then(() => {
                        this.handleCallbacks(options.queue.guildId);
                    })
                    .catch((e) => {
                        this.client.emit('error', e);
                        this.handleErrorCallbacks(options.queue.guildId);
                    });
            })
            .catch((error) => {
                this.client.emitEvent('error', error);
                this.handleCallbacks(options.queue.guildId);
            });
    }

    private getQueueOptions(
        options: UpdateQueueOptions,
    ): InteractionReplyOptions {
        const embedOptions: QueueEmbedOptions = options as QueueEmbedOptions;
        embedOptions.client = this.client;
        if (options.embedOnly) {
            return { embeds: [new QueueEmbed(embedOptions)] };
        }
        const components: MessageActionRow[] = [];
        let commandActionRow: MessageActionRow[] = [];
        commandActionRow = commandActionRow.concat(
            this.getCommandsActionRow(options.queue),
        );
        for (const row of commandActionRow) components.push(row);
        return {
            embeds: [new QueueEmbed(embedOptions)],
            components: components,
        };
    }

    private getCommandsActionRow(queue: Queue): MessageActionRow[] {
        const buttons: MessageButton[] = [];
        let dropdown: MessageSelectMenu | null = null;
        for (const val in Commands) {
            try {
                const command: Command | null = this.getCommand(
                    val,
                    queue.guildId,
                );
                const button: MessageButton | null | undefined =
                    command?.button(queue);
                const dpdwn: MessageSelectMenu | null | undefined =
                    command?.selectMenu(queue);
                if (dpdwn) dropdown = dpdwn;
                if (!command || !button) continue;
                buttons.push(button);
            } catch (e) {
                if (e instanceof Error) this.client.emitEvent('error', e);
            }
        }
        const rows: MessageActionRow[] = [];
        rows.push(new MessageActionRow());
        let lenIdx = 0;
        let idx = 0;
        for (let i = 0; i < buttons.length; i++) {
            if (idx > 4) break;
            const s: number = rows[idx].components.reduce((sum, cur) => {
                if (!(cur instanceof MessageButton)) return sum;
                return sum + (cur.label ? cur.label.length : 0);
            }, 0);
            const len: number = s >= 20 ? 3 : 4;
            if (buttons.length > len && i === lenIdx + len) {
                lenIdx += len;
                rows.push(new MessageActionRow());
                idx += 1;
            }
            rows[idx].addComponents(buttons[i]);
        }
        if (dropdown && rows.length < 5) {
            rows.push(new MessageActionRow().addComponents(dropdown));
        }
        if (rows[0].components.length === 0) return [];
        return rows;
    }

    private getCommand(val: string, guildId: string): Command | null {
        return new (<any>Commands)[val](this.client, guildId);
    }

    private getThreadOptions(): StartThreadOptions {
        return {
            name: this.client.translate(['music', 'thread', 'name']),
            reason: this.client.translate(['music', 'thread', 'reason']),
        };
    }

    private async newQueueMessage(options: UpdateQueueOptions) {
        if (
            (!options.interaction && !options.message) ||
            (options.interaction &&
                !options.interaction.isButton() &&
                !options.interaction.isCommand())
        )
            return;
        const guild: Guild | undefined | null = options.interaction
            ? options.interaction.guild
            : options.message?.guild;
        const channel: TextBasedChannel | undefined | null =
            options.interaction
                ? options.interaction.channel
                : options.message?.channel;
        if (!guild || !channel || !(channel instanceof TextChannel)) return;
        this.client.logger.debug(
            `Sending new queue message in guild '${guild.id}'`,
        );
        options.queue.channelId = channel.id;
        options.queue.guildId = guild.id;

        const updateOptions: InteractionReplyOptions =
            this.getQueueOptions(options);
        let message: Message | undefined = undefined;
        if (options.interaction && options.interaction.isCommand())
            message = await options.interaction
                .reply({
                    fetchReply: true,
                    embeds: updateOptions.embeds,
                    components: updateOptions.components,
                })
                .then((r) => {
                    if (!(r instanceof Message)) return undefined;
                    return r;
                })
                .catch((e) => {
                    this.client.emitEvent('error', e);
                    return undefined;
                });
        else
            message = await channel
                .send({
                    embeds: updateOptions.embeds,
                    components: updateOptions.components,
                })
                .catch((e) => {
                    this.client.emitEvent('error', e);
                    return undefined;
                });
        if (!message) return;
        const t: ThreadChannel | undefined = await this.startThread(message);
        if (!t || !message.guildId || !message.channelId) {
            message.delete().catch((e) => {
                this.client.emitEvent('error', e);
            });
            return;
        }
        options.queue.messageId = message.id;
        options.queue.threadId = t.id;
        options.queue = await options.queue.save();
        if (
            options.interaction &&
            !options.interaction.deferred &&
            options.interaction.isButton()
        ) {
            options.interaction.deferUpdate().catch((e) => {
                this.client.emitEvent('error', e);
            });
        }
    }

    private async startThread(
        message: Message | PartialMessage,
    ): Promise<ThreadChannel | undefined> {
        if (!message.guildId) return;
        const gId: string = message.guildId;
        this.client.logger.debug(
            `Oppening thread on message '${message.id}' in guild '${gId}'`,
        );
        return await message
            .startThread(this.getThreadOptions())
            .catch((e) => {
                this.client.emitEvent('error', e);
                return undefined;
            });
    }

    private handleCallbacks(guildId: string): void {
        if (guildId in this.callbacks)
            for (const c of this.callbacks[guildId]) {
                c().catch((e) => {
                    this.client.emitEvent('error', e);
                });
                delete this.callbacks[guildId];
            }
    }

    private handleErrorCallbacks(guildId: string): void {
        if (guildId in this.errorCallbacks)
            for (const c of this.errorCallbacks[guildId]) {
                c().catch((e) => {
                    this.client.emitEvent('error', e);
                });
                delete this.errorCallbacks[guildId];
            }
    }
}

export namespace OnQueueMessageUpdate {
    export type Type = [
        'queueMessageUpdate',
        ...Parameters<OnQueueMessageUpdate['callback']>,
    ];
}
