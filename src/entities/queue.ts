import { BaseEntity, Column, Entity, OneToMany, PrimaryColumn } from 'typeorm';
import { Song } from './song';

@Entity('queue')
export class Queue extends BaseEntity {
    @PrimaryColumn()
    clientId: string;

    @PrimaryColumn()
    guildId: string;

    @Column({ nullable: false })
    channelId: string;

    @Column({ nullable: false })
    messageId: string;

    @Column({ nullable: false })
    threadId: string;

    @Column({ nullable: false })
    offset: number;

    @Column({ nullable: false })
    color: number;

    @Column('text', { array: true })
    options: string[];

    @OneToMany(() => Song, (song) => song.queue, {
        cascade: true,
        eager: true,
    })
    songs: Song[];
}