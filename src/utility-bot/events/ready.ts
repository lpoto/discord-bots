import { UtilityClient } from '../client';
import { RolesMessage } from '../entities';
import { Poll } from '../entities/poll';
import { AbstractUtilityEvent } from '../utils/abstract-utility-event';

export class OnReady extends AbstractUtilityEvent {
    public constructor(client: UtilityClient) {
        super(client);
        this.once = true;
    }

    public async callback(): Promise<void> {
        await this.setup();
    }

    private async checkEntities(): Promise<void> {
        await RolesMessage.removeOldMessages();
        await Poll.removeOldMessages();
    }

    private async setup(): Promise<void> {
        if (!this.client.user) return;

        this.client.logger.info(
            `Utility Client Logged in as user ${this.client.user.tag}`,
        );

        await this.checkEntities();

        await this.client.registerSlashCommands(
            this.client.translator.getFullLanguage().utility.slashCommands,
        );
        this.client.user.setActivity('/help', {
            type: 'LISTENING',
        });
        this.client.ready = true;
        this.client.logger.info('Utility Client ready!');
    }
}

export namespace OnReady {
    export type Type = ['ready', ...Parameters<OnReady['callback']>];
}
