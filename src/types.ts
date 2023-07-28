export type LogEntry = {
    index: number;
    term: number;
    command: string;
}

export type AppendEntryRPC = {
    term: number;
    leaderId: number;
    prevLogIndex: number;
    prevLogTerm: number;
    entries: LogEntry[];
    leaderCommit: number;
}

export type AppendEntryRPCResponse = {
    term: number;
    success: boolean;
}

export type RequestVoteRPC = {
    term: number;
    candidateId: number;
    lastLogIndex: number;
    lastLogTerm: number;
}

export type RequestVoteRPCResponse = {
    term: number;
    voteGranted: boolean;
}

export type ClientRequestResponseUnavailable = {
    kind: 'unavailable';
}
export type ClientRequestResponseSuccess = {
    kind: 'success';
}
export type ClientRequestResponseRedirect = {
    kind: 'redirect';
    leaderId: number;
}
export type ClientRequestResponse = ClientRequestResponseUnavailable | ClientRequestResponseSuccess | ClientRequestResponseRedirect;