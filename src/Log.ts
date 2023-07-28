import { LogEntry } from "./types.ts";

export class Log {
    log: LogEntry[] = [];

    constructor() {
        this.log = [];
    }

    append(entry: LogEntry) {
        this.log.push(entry);
    }

    get(index: number): LogEntry | undefined {
        return this.log.find(entry => entry.index === index);
    }

    get last(): LogEntry | undefined {
        return this.log.length ? this.log[this.log.length - 1] : undefined;
    }

    truncate(index: number) {
        this.log = this.log.filter(entry => entry.index < index);
    }

}