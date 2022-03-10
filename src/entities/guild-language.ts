import { BaseEntity, Column, Entity, PrimaryColumn } from 'typeorm';
import { LanguageString } from '../../';

@Entity('guild_language')
export class GuildLanguage extends BaseEntity {
    @PrimaryColumn()
    guildId: string;

    @Column({ nullable: false })
    language: LanguageString;
}