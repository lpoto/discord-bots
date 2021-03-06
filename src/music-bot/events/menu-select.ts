import { GuildMember, SelectMenuInteraction } from 'discord.js';
import { MusicClient } from '../client';
import { Queue } from '../entities';
import { AbstractMusicEvent } from '../utils/abstract-music-event';

export class OnMenuSelect extends AbstractMusicEvent {
    public constructor(client: MusicClient) {
        super(client);
    }

    public async callback(interaction: SelectMenuInteraction): Promise<void> {
        if (
            this.client.ready &&
            interaction.component !== undefined &&
            interaction.component.placeholder !== null &&
            interaction.component.placeholder !== undefined &&
            interaction.customId.includes('||')
        ) {
            this.eventQueue.addToQueue(interaction.message.id, () =>
                this.execute(interaction),
            );
        }
    }

    private async execute(interaction: SelectMenuInteraction): Promise<void> {
        if (!interaction.guildId || !this.client.user) return;
        await Queue.findOne({
            guildId: interaction.guildId,
            clientId: this.client.user.id,
        }).then((queue) => {
            if (
                !queue ||
                !(interaction.member instanceof GuildMember) ||
                !interaction.component.placeholder
            )
                return;
            this.client.logger.debug(
                `Select menu '${interaction.component.placeholder}'`,
                'on queue message in guild',
                `'${interaction.guildId}'`,
            );
            this.client.emitEvent('executeCommand', {
                interaction: interaction,
                member: interaction.member,
            });
        });
    }
}

export namespace OnMenuSelect {
    export type Type = ['menuSelect', ...Parameters<OnMenuSelect['callback']>];
}
