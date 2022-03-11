import {
    ButtonInteraction,
    InteractionWebhook,
    MessageAttachment,
    MessageButton,
} from 'discord.js';
import { MessageButtonStyles } from 'discord.js/typings/enums';
import moment from 'moment';
import { Not } from 'typeorm';
import { MusicClient } from '../client';
import { Queue, Song } from '../entities';
import { Notification } from '../entities/notification';
import { AbstractCommand } from '../models';

export class Clear extends AbstractCommand {
    constructor(client: MusicClient, guildId: string) {
        super(client, guildId);
    }

    get description(): string {
        return this.translate(['music', 'commands', 'clear', 'description']);
    }

    public button(queue: Queue): MessageButton | null {
        if (!this.connection || !queue.options.includes('editing'))
            return null;
        return new MessageButton()
            .setLabel(this.translate(['music', 'commands', 'clear', 'label']))
            .setDisabled(queue.size < 2)
            .setStyle(
                queue.options.includes('clearRequest')
                    ? MessageButtonStyles.PRIMARY
                    : MessageButtonStyles.SECONDARY,
            )
            .setCustomId(this.id);
    }

    public async execute(interaction?: ButtonInteraction): Promise<void> {
        if (
            !interaction ||
            interaction.deferred ||
            interaction.replied ||
            !interaction.component ||
            !interaction.user
        )
            return;
        const queue: Queue | undefined = await this.getQueue();
        if (!queue) return;

        if (interaction.component.style === 'PRIMARY') {
            queue.offset = 0;
            await queue.save();
            if (queue.size > 0) {
                queue.allSongs.then((songs) => {
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
                            'clear',
                            'reply',
                        ]),
                        files: [attachment],
                    });
                });
            }

            queue.options = queue.options.filter(
                (o) =>
                    ![
                        'clearRequest',
                        'removeSelected',
                        'forwardSelected',
                        'translateSelected',
                    ].includes(o),
            );
            await queue.save();

            // remove all songs but the head song
            await Song.createQueryBuilder('song')
                .where({ id: Not(queue.headSong?.id) })
                .delete()
                .execute();

            this.client.musicActions.updateQueueMessage({
                interaction: interaction,
                queue: queue,
                reload: true,
            });
        } else {
            if (!queue.options.includes('clearRequest'))
                queue.options.push('clearRequest');
            await queue.save();
            const webhook: InteractionWebhook = interaction.webhook;
            this.client.musicActions
                .updateQueueMessage({ interaction: interaction, queue: queue })
                .then((result) => {
                    if (!result || !this.client.user) return;
                    const notification: Notification = Notification.create({
                        userId: interaction.user.id,
                        clientId: this.client.user.id,
                        guildId: this.guildId,
                        expires: moment(moment.now()).add(24, 'h').toDate(),
                        name: 'clearStopRequest',
                    });
                    Notification.findOne({
                        userId: notification.userId,
                        clientId: notification.clientId,
                        guildId: notification.guildId,
                        name: notification.name,
                    }).then((n) => {
                        if (n) return;
                        notification.save().then(() => {
                            webhook
                                .send({
                                    content: this.translate([
                                        'music',
                                        'commands',
                                        'clear',
                                        'confirm',
                                    ]),
                                    ephemeral: true,
                                })
                                .catch((e) => {
                                    this.client.handleError(
                                        e,
                                        'clear.ts -> execute',
                                    );
                                });
                        });
                    });

                    const x: NodeJS.Timeout = setTimeout(() => {
                        queue
                            .reload()
                            .then(() => {
                                if (!queue.options.includes('editing')) return;
                                queue.options = queue.options.filter(
                                    (o) => o !== 'clearRequest',
                                );
                                queue.save().then(() => {
                                    this.client.musicActions.updateQueueMessage(
                                        {
                                            queue: queue,
                                            componentsOnly: true,
                                        },
                                    );
                                });
                            })
                            .catch(() => {});
                    }, 5000);
                    x.unref();
                });
        }
    }
}
