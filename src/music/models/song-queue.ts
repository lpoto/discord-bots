import { Song } from './song';

export class SongQueue {
    private songs: Song[] = [];

    get size() {
        return this.songs.length;
    }

    get allSongs(): Song[] {
        return this.songs;
    }

    get head(): Song | null {
        if (!this.songs || this.songs.length < 1) return null;
        return this.songs[0];
    }

    public async enqueue(nameOrUrl: string): Promise<void> {
        return Song.find(nameOrUrl).then((songs) => {
            if (!songs) return;
            for (const song of songs) this.songs.push(song);
        });
    }

    public enqueueSong(song: Song) {
        this.songs.push(song);
    }

    public dequeue(): Song | null {
        if (!this.songs || this.size < 1) return null;
        const song: Song | undefined = this.songs.shift();
        return song ? song : null;
    }

    public forward(idx: number): void {
        if (idx < 2 || this.size < 3 || idx >= this.size) return;
        const song: Song = this.songs[1];
        this.songs[1] = this.songs[idx];
        this.songs[idx] = song;
    }

    public async shuffle(): Promise<void> {
        if (this.size < 3) return;
        for (let i: number = this.size - 1; i > 1; i--) {
            let randomIndex: number = Math.floor(Math.random() * i);
            while (randomIndex === 0)
                randomIndex = Math.floor(Math.random() * i);
            [this.songs[i], this.songs[randomIndex]] = [
                this.songs[randomIndex],
                this.songs[i],
            ];
        }
    }

    public async clear(): Promise<void> {
        if (this.songs.length < 2) return;
        this.songs.splice(1, this.songs.length - 1);
    }

    public removeByIndex(songIndex: number): void {
        if (!this.songs) this.songs = [];
        if (this.size <= songIndex || songIndex < 0) return;
        this.songs.splice(songIndex, 1);
    }

    public removeIndexes(indexes: number[]): void {
        try {
            this.songs = this.songs.filter((_, idx) => !indexes.includes(idx));
        } catch (e) {
            console.error('Error removing songs from queue: ', e);
        }
    }

    public forwardByIndex(index: number): void {
        if (this.size < 3 || index >= this.size) return;
        const toReplace: Song = this.songs[1];
        this.songs[1] = this.songs[index];
        this.songs[index] = toReplace;
    }
}
