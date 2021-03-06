import {
    ButtonInteraction,
    InteractionWebhook,
    Message,
    MessageAttachment,
    MessageButton,
    ThreadChannel,
} from 'discord.js';
import { MessageButtonStyles } from 'discord.js/typings/enums';
import { MusicClient } from '../client';
import { Queue, QueueOption } from '../entities';
import { Notification } from '../../common-entities';
import { AbstractCommand } from '../utils';

export class Stop extends AbstractCommand {
    public constructor(client: MusicClient, guildId: string) {
        super(client, guildId);
    }

    public get interactionTimeout(): number {
        return 300;
    }

    public get checkRolesFor(): string {
        return this.translate([
            'music',
            'commands',
            'stop',
            'rolesConfigName',
        ]);
    }

    public get description(): string {
        return this.translate(['music', 'commands', 'stop', 'description']);
    }

    public button(queue: Queue): MessageButton | null {
        if (!this.connection) return null;
        return new MessageButton()
            .setLabel(this.translate(['music', 'commands', 'stop', 'label']))
            .setStyle(
                queue.hasOption(QueueOption.Options.STOP_SELECTED)
                    ? MessageButtonStyles.PRIMARY
                    : MessageButtonStyles.SECONDARY,
            )
            .setCustomId(this.id);
    }

    public async execute(interaction?: ButtonInteraction): Promise<void> {
        if (
            !this.client.user ||
            !interaction ||
            !interaction.component ||
            !interaction.user ||
            interaction.deferred ||
            interaction.replied
        )
            return;
        const queue: Queue | undefined = await this.getQueue();
        if (!queue) return;

        if (queue.hasOption(QueueOption.Options.STOP_SELECTED)) {
            return this.stopSelectedClick(queue, interaction);
        }

        this.stopNotSelectedClick(queue, interaction);
    }

    private async stopNotSelectedClick(
        queue: Queue,
        interaction: ButtonInteraction,
    ): Promise<void> {
        if (!this.client.user) return;

        if (!queue.hasOption(QueueOption.Options.STOP_SELECTED)) {
            queue = await queue.addOption(QueueOption.Options.STOP_SELECTED);
            queue = await queue.save();
        }

        const webhook: InteractionWebhook = interaction.webhook;
        this.updateQueue({
            queue: queue,
            interaction: interaction,
        });
        const notification: Notification = Notification.create({
            userId: interaction.user.id,
            clientId: this.client.user.id,
            guildId: this.guildId,
            minutesToPersist: 24 * 60,
            name: 'clearStopRequest',
        });
        Notification.findOne({
            userId: notification.userId,
            clientId: notification.clientId,
            guildId: notification.guildId,
            name: notification.name,
        }).then((n) => {
            if (n) return;
            notification
                .save()
                .then(() => {
                    webhook
                        .send({
                            content: this.translate([
                                'music',
                                'commands',
                                'stop',
                                'confirm',
                            ]),
                            ephemeral: true,
                        })
                        .catch((e) => this.client.emitEvent('error', e));
                })
                .catch((e) => this.client.emitEvent('error', e));
        });

        const x: NodeJS.Timeout = setTimeout(async () => {
            if (!queue) return;
            queue
                .reload()
                .then(async () => {
                    if (!queue) return;
                    queue = queue.removeOptions([
                        QueueOption.Options.STOP_SELECTED,
                    ]);
                    queue = await queue.save();
                    if (!queue) return;
                    this.client.emitEvent('queueMessageUpdate', {
                        queue: queue,
                    });
                })
                .catch(() => {});
        }, 5000);
        x.unref();
    }

    private async stopSelectedClick(
        queue: Queue,
        interaction: ButtonInteraction,
    ): Promise<void> {
        this.client.logger.debug(`Stopping music in guild '${queue.guildId}'`);
        if (queue.size > 0) {
            queue.getAllSongsWithoutHead().then((songs) => {
                if (!songs) return;
                const attachment = new MessageAttachment(
                    Buffer.from(
                        songs
                            .map(
                                (s) =>
                                    `{ name: \`${s.name}\`, url: \`${s.url}\` }`,
                            )
                            .join('\n'),
                        'utf-8',
                    ),
                    'removed-songs.txt',
                );
                interaction.user.send({
                    content: this.translate([
                        'music',
                        'commands',
                        'stop',
                        'reply',
                    ]),
                    files: [attachment],
                });
            });
        }
        await queue.remove();
        if (
            interaction.message.thread &&
            interaction.message.thread instanceof ThreadChannel
        )
            interaction.message.thread.delete().catch((e) => {
                this.client.emitEvent('error', e);
            });
        if (interaction.message instanceof Message)
            interaction.message.delete().catch((e) => {
                this.client.emitEvent('error', e);
            });
        this.client.destroyVoiceConnection(interaction.guildId);
    }
}
