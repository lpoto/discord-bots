import { ButtonInteraction, MessageButton } from 'discord.js';
import { MessageButtonStyles } from 'discord.js/typings/enums';
import { MusicClient } from '../client';
import { Queue, QueueOption } from '../entities';
import { AbstractCommand } from '../utils';

export class EditQueue extends AbstractCommand {
    public constructor(client: MusicClient, guildId: string) {
        super(client, guildId);
    }

    public get description(): string {
        return this.translate(['music', 'commands', 'edit', 'description']);
    }

    public get checkRolesFor(): string {
        return this.translate([
            'music',
            'commands',
            'edit',
            'rolesConfigName',
        ]);
    }

    public button(queue: Queue): MessageButton | null {
        if (!this.connection) return null;
        return new MessageButton()
            .setLabel(this.translate(['music', 'commands', 'edit', 'label']))
            .setDisabled(false)
            .setStyle(
                queue.hasOption(QueueOption.Options.EDITING)
                    ? MessageButtonStyles.SUCCESS
                    : MessageButtonStyles.SECONDARY,
            )
            .setCustomId(this.id);
    }

    public async execute(interaction?: ButtonInteraction): Promise<void> {
        if (!interaction || !interaction.user) return;
        let queue: Queue | undefined = await this.getQueue();
        if (!queue) return;

        if (queue.hasOption(QueueOption.Options.EDITING)) {
            queue = queue.removeDropdownOptions();
            queue = queue.removeOptions([QueueOption.Options.EDITING]);
        } else queue = await queue.addOption(QueueOption.Options.EDITING);

        await queue.save();

        this.updateQueue({
            queue: queue,
            interaction: interaction,
        });
    }
}
