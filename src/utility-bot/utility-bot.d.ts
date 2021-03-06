import {
    ButtonInteraction,
    CommandInteraction,
    Message,
    SelectMenuInteraction,
} from 'discord.js';
import { CustomClientOptions } from '../../';
import * as Events from './events';

export type UtilityClientOptions = CustomClientOptions;

export type Event =
    | Events.OnReady.Type
    | Events.OnInteractionCreate.Type
    | Events.OnSlashCommand.Type
    | Events.OnHelpSlashCommand.Type
    | Events.OnPollSlashCommand.Type
    | Events.OnRolesSlashCommand.Type
    | Events.OnConfigSlashCommand.Type
    | Events.OnHandleRolesMessage.Type
    | Events.OnHandlePollMessage.Type
    | Events.OnHelpSlashCommand.Type
    | Events.OnButtonClick.Type
    | Events.OnMessageDelete.Type
    | Events.OnMenuSelect.Type
    | Events.OnMessageCreate.Type
    | Events.OnError.Type;

interface HandleMessageOptions {
    type: string;
    messageId: string;
    interaction?:
        | ButtonInteraction
        | SelectMenuInteraction
        | CommandInteraction;
    threadMessage?: Message;
    repliedMessage?: Message;
}

interface HandleRolesMessageOptions extends HandleMessageOptions {
    type: 'create' | 'selectMenu' | 'reply' | 'buttonClick';
}

interface HandlePollMessageOptions extends HandleMessageOptions {
    type: 'create' | 'reply' | 'buttonClick' | 'threadMessage';
}
