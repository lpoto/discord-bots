import {
    AfterLoad,
    BaseEntity,
    Column,
    Entity,
    JoinTable,
    ManyToMany,
    Not,
    OneToMany,
    PrimaryColumn,
} from 'typeorm';
import { Languages } from '../translation';
import { QueueOption } from './queue-option';
import { Song } from './song';

@Entity('queue')
export class Queue extends BaseEntity {
    public static readonly songsPerPage: number = 10;

    @PrimaryColumn()
    public clientId: string;

    @PrimaryColumn()
    public guildId: string;

    @Column({ nullable: false })
    public channelId: string;

    @Column({ nullable: false })
    public messageId: string;

    @Column({ nullable: false })
    public threadId: string;

    @Column({ nullable: false })
    public offset: number;

    @Column({ nullable: false })
    public color: number;

    @ManyToMany(() => QueueOption, (queueOption) => queueOption.queue, {
        eager: true,
    })
    @JoinTable()
    public options: QueueOption[];

    @OneToMany(() => Song, (song) => song.queue, {
        cascade: true,
        orphanedRowAction: 'delete',
        lazy: true,
    })
    public allSongs: Promise<Song[]>;

    public headSong: Song | undefined;

    public curPageSongs: Song[] = [];

    public size = 0;

    @AfterLoad()
    public async afterQueueLoad(): Promise<void> {
        // count all songs referencing this queue
        this.size = await Song.count({ where: { queue: this } });

        this.checkOffset();
        this.checkOptions();

        // Set a headSong (song with smallest position)
        const minPosition: number = await Song.minPosition(this);
        this.headSong = await Song.findOne({
            where: {
                queue: this,
                position: minPosition,
            },
        });

        // Load only as many songs that fit a single embed page (based on offset)
        this.curPageSongs = await Song.createQueryBuilder('song')
            .where({ queue: this, id: Not(this.headSong?.id) })
            .orderBy({ position: 'ASC' })
            .limit(Queue.songsPerPage)
            .offset(this.offset)
            .getMany();
    }

    public hasOption(o: QueueOption.Options): boolean {
        if (!this.options) return false;
        return this.options.find((o2) => o2.name === o) !== undefined;
    }

    public async addOption(o: QueueOption.Options): Promise<Queue> {
        return QueueOption.findOne(o).then((opt) => {
            if (!opt) return this;
            if (
                this.options.find((opt2) => opt2.name === opt.name) !==
                undefined
            )
                return this;
            this.options.push(opt);
            return this;
        });
    }

    public removeOptions(options: QueueOption.Options[]): Queue {
        if (this.options)
            this.options = this.options.filter(
                (o) => !options.includes(o.name),
            );
        return this;
    }

    private checkOffset(): void {
        if (this.offset === 0) return;
        while (this.offset + 1 >= this.size) this.offset -= Queue.songsPerPage;
        if (this.offset < 0) this.offset = 0;
    }

    private async checkOptions(): Promise<void> {
        if (this.size < 2) {
            this.removeOptions([
                QueueOption.Options.FORWARD_SELECTED,
                QueueOption.Options.REMOVE_SELECTED,
            ]);
        } else if (this.size < 3) {
            this.removeOptions([QueueOption.Options.REMOVE_SELECTED]);
        }
        if (Object.keys(Languages).length < 2) {
            this.removeOptions([QueueOption.Options.TRANSLATE_SELECTED]);
        }
    }
}
