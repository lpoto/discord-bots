import { AudioPlayer, AudioPlayerStatus } from '@discordjs/voice';
import { NewSongOptions } from '../../';
import { MusicClient } from '../client';
import { SongFinder } from '../utils';
import { AbstractClientEvent } from '../utils/abstract-client-event';
import { Queue, Song } from '../entities';

export class OnNewSong extends AbstractClientEvent {
    private songsToUpdateCount: {
        [guildId: string]: { [key in 'toUpdate' | 'updated']: number };
    };
    private songsToUpdate: {
        [guildId: string]: Song[];
    };

    public constructor(client: MusicClient) {
        super(client);
        this.songsToUpdate = {};
        this.songsToUpdateCount = {};
    }

    public async callback(options: NewSongOptions): Promise<void> {
        if (!this.client.user) return;
        const queue: Queue | undefined = await Queue.findOne({
            guildId: options.guildId,
            clientId: this.client.user.id,
        });
        if (!queue) return;
        const songs: string[] = options.songNames;
        // limit songs
        if (queue.size >= 20000 || queue.size + songs.length > 25000) return;

        if (
            !(queue.guildId in this.songsToUpdateCount) ||
            this.songsToUpdateCount[queue.guildId].toUpdate === undefined ||
            this.songsToUpdateCount[queue.guildId].updated === undefined
        ) {
            this.songsToUpdateCount[queue.guildId] = {
                toUpdate: 0,
                updated: 0,
            };
        }

        this.songsToUpdateCount[queue.guildId].toUpdate += songs.length;

        for (let i = 0; i < songs.length; i++) {
            /* filter songs, if both name and url provided, extract url
             * else it will be determined when fetchign songs from youtube
             * */
            const s: string = songs[i];
            let n: string = s.trim();
            if (n[0] === '{' && n.includes('url:')) {
                n = s.substring(1, n.length - 1);
                n = n.split('url:')[1].split(',')[0].trim();
            }
            if (
                (n[0] === '"' && n[n.length - 1] === '"') ||
                // eslint-disable-next-line
                (n[0] === "'" && n[n.length - 1] === "'") ||
                (n[0] === '`' && n[n.length - 1] === '`')
            )
                n = n.substring(1, n.length - 1);
            new SongFinder(n).getSongs().then((songs2) => {
                if (songs2 && songs2.length > 0) {
                    if (!(queue.guildId in this.songsToUpdate))
                        this.songsToUpdate[queue.guildId] = [];
                    for (const s2 of songs2) {
                        this.songsToUpdate[queue.guildId].push(s2);
                    }
                    this.checkIfNeedsUpdate(queue.guildId, songs2.length);
                }
            });
        }
    }

    private checkIfNeedsUpdate(guildId: string, add?: number): void {
        if (
            !this.client.user ||
            !this.songsToUpdateCount[guildId] ||
            this.songsToUpdateCount[guildId].updated === undefined
        )
            return;
        if (add) this.songsToUpdateCount[guildId].updated += add;
        const updateAndDelete: boolean =
            this.songsToUpdateCount[guildId].updated ===
            this.songsToUpdateCount[guildId].toUpdate;
        const onlyUpdate: boolean = updateAndDelete
            ? false
            : (this.songsToUpdateCount[guildId].updated + 1) % 100 === 0;
        if (updateAndDelete || onlyUpdate) {
            if (updateAndDelete) delete this.songsToUpdateCount[guildId];
            if (!(guildId in this.songsToUpdate))
                this.songsToUpdate[guildId] = [];
            Song.saveAll(
                this.songsToUpdate[guildId],
                guildId,
                this.client.user.id,
            ).then(() => {
                if (!this.client.user) return;
                Queue.findOne({
                    guildId: guildId,
                    clientId: this.client.user.id,
                }).then((queue) => {
                    if (!queue) return;
                    const audioPlayer: AudioPlayer | null =
                        this.client.getAudioPlayer(guildId);
                    if (
                        !audioPlayer ||
                        (audioPlayer.state.status !==
                            AudioPlayerStatus.Playing &&
                            audioPlayer.state.status !==
                                AudioPlayerStatus.Paused)
                    ) {
                        this.client.emitEvent('executeCommand', {
                            name: 'Play',
                            guildId: guildId,
                        });
                    }
                    this.client.emitEvent('queueMessageUpdate', {
                        queue: queue,
                    });
                });
            });
            delete this.songsToUpdate[guildId];
        }
    }
}

export namespace OnNewSong {
    export type Type = ['newSong', ...Parameters<OnNewSong['callback']>];
}
