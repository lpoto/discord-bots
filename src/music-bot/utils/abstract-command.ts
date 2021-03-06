import { VoiceConnection } from '@discordjs/voice';
import { randomUUID } from 'crypto';
import {
    ButtonInteraction,
    CommandInteraction,
    Message,
    MessageButton,
    MessageSelectMenu,
    PartialMessage,
    SelectMenuInteraction,
} from 'discord.js';
import { MusicClient } from '../client';
import { LanguageKeyPath } from '../../../';
import { Queue } from '../entities';
import { CommandName, UpdateQueueOptions } from '../music-bot';
import { CustomAudioPlayer } from './custom-audio-player';

export abstract class AbstractCommand {
    private commandId: string;
    private commandId2: string;
    private shouldDefer: boolean;
    protected client: MusicClient;
    protected guildId: string;

    public constructor(client: MusicClient, guildId: string) {
        this.client = client;
        this.guildId = guildId;
        this.commandId = this.name + '||' + randomUUID();
        this.commandId2 = this.name + '||' + randomUUID();
        this.shouldDefer = true;
    }

    public get id(): string {
        return this.commandId;
    }

    public get alwaysExecute(): boolean {
        return false;
    }

    public get reggex(): RegExp | null {
        return null;
    }

    public get checkRolesFor(): string | null {
        return null;
    }

    public get needsDefer(): boolean {
        return this.alwaysExecute ? false : this.shouldDefer;
    }

    public get interactionTimeout(): number {
        return this.alwaysExecute ? 0 : 250;
    }

    public get id2(): string {
        return this.commandId2;
    }

    public get name(): string {
        return (<any>this).constructor.name;
    }

    public get joinVoice(): boolean {
        return true;
    }

    public get checkMemberPerms(): boolean {
        return true;
    }

    public get audioPlayer(): CustomAudioPlayer | null {
        return this.client.getAudioPlayer(this.guildId);
    }

    public get connection(): VoiceConnection | null {
        return this.client.getVoiceConnection(this.guildId);
    }

    public get description(): string | null {
        return null;
    }

    public get additionalHelp(): string | null {
        return null;
    }

    public async getQueue(): Promise<Queue | undefined> {
        if (!this.client.user) return undefined;
        return await Queue.findOne({
            clientId: this.client.user.id,
            guildId: this.guildId,
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public button(queue: Queue): MessageButton | null {
        return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public selectMenu(queue: Queue): MessageSelectMenu | null {
        return null;
    }

    public button2(queue: Queue): MessageButton | null {
        return this.button(queue);
    }

    public translate(keys: LanguageKeyPath): string {
        return this.client.translate(keys);
    }

    public async execute(
        interaction?:
            | ButtonInteraction
            | CommandInteraction
            | Message
            | PartialMessage,
    ): Promise<void> {
        if (!interaction || !this.client.user) return;
        this.client.logger.debug(interaction.id);
        this.client.logger.debug(this.client.user.id);
        this.client.logger.debug(this.guildId);
    }

    public async executeFromSelectMenu(
        interaction: SelectMenuInteraction,
    ): Promise<void> {
        if (!interaction || !this.client.user) return;
        this.client.logger.debug(interaction.id);
        this.client.logger.debug(this.client.user.id);
        this.client.logger.debug(this.guildId);
    }

    public async executeFromReggex(message: Message): Promise<void> {
        if (!message) return;
        this.client.logger.debug(message.id);
    }

    public async deferInteractions(doNotDefer?: boolean): Promise<void> {
        try {
            return this.client.activeCommandsOptions.deferInteractions(
                this.name as CommandName,
                this.guildId,
                doNotDefer,
            );
        } catch (e) {
            return;
        }
    }

    protected updateQueue(options: UpdateQueueOptions): void {
        this.shouldDefer = false;
        if (options.onUpdate === undefined)
            options.onUpdate = () => this.deferInteractions();
        if (options.onError === undefined)
            options.onError = () => this.deferInteractions(true);
        this.client.emitEvent('queueMessageUpdate', options);
    }
}
