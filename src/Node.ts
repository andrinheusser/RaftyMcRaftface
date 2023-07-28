import { Log } from './Log.ts';
import { AppendEntryRPC, AppendEntryRPCResponse, ClientRequestResponse, RequestVoteRPC, RequestVoteRPCResponse } from './types.ts'

const ELECTION_TIMEOUT = 150

export class Node {

    nodeId: number;
    leaderId = -1;

    state: 'follower' | 'candidate' | 'leader' = 'follower';

    currentTerm: number;
    votedFor: number | null;
    log: Log;

    electionTimeout = 0;
    electionTimeoutInterval = 0;
    hasReceivedHeartbeat = false;
    heartbeatInterval = 0;

    commitIndex = 0;
    lastApplied = 0;

    nextIndex: { nodeId: number, index: number }[] = [];
    matchIndex: { nodeId: number, index: number }[] = [];

    votes = 0;

    neighbors: Node[] = [];

    constructor(nodeId: number) {

        this.currentTerm = 0;
        this.votedFor = null;
        this.log = new Log();
        this.nodeId = nodeId;

        this.becomeFollower(-1);
        this.startElectionTimeoutInterval();
    }

    addNeighbors(neighbors: Node[]) {
        this.neighbors = neighbors;
    }

    startElectionTimeoutInterval() {
        this.electionTimeout = Math.floor(Math.random() * ELECTION_TIMEOUT) + ELECTION_TIMEOUT;
        this.electionTimeoutInterval = setInterval(() => {

            if (this.state === 'follower') {
                if (!this.hasReceivedHeartbeat) {
                    this.becomeCandidate();
                } else {
                    this.hasReceivedHeartbeat = false;
                }
            }
            if (this.state === 'candidate') {
                this.becomeCandidate();
            }
            if (this.state === 'leader') {
                clearInterval(this.electionTimeoutInterval);
            }

        }, this.electionTimeout);
    }

    startSendingHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.state === 'leader') {
                Promise.all(this.neighbors.map(neighbor => {
                    neighbor.receiveAppendEntries({
                        term: this.currentTerm,
                        leaderId: this.nodeId,
                        prevLogIndex: 0,
                        prevLogTerm: 0,
                        entries: [],
                        leaderCommit: this.commitIndex
                    });
                }));
            }
        }, 50);
    }
    sendEntries() {
        console.log(`Node ${this.nodeId} is sending entries to all followers`, this.neighbors.map(neighbor => neighbor.nodeId).join(', '));
        for (const follower of this.neighbors) {
            this.sendEntriesToFollower(follower);
        }
    }

    sendEntriesToFollower(follower: Node) {
        const lastLogIndex = this.log.last ? this.log.last.index : -1;
        const followerId = follower.nodeId;
        const followerNextIndex = this.nextIndex.find(({ nodeId }) => nodeId === followerId)?.index ?? 0;

        if (lastLogIndex >= followerNextIndex) {
            const prevLogIndex = followerNextIndex - 1;
            const prevLogTerm = this.log.get(prevLogIndex)?.term ?? 0;
            console.log('Slicing log from ' + followerNextIndex + ' to end', this.log.log.map(c => c.command).join(', '), this.log.log.slice(followerNextIndex))
            const entries = this.log.log.slice(followerNextIndex);
            const leaderCommit = this.commitIndex;
            const follower = this.neighbors.find(neighbor => neighbor.nodeId === followerId);
            if (follower) {
                const payload: AppendEntryRPC = {
                    term: this.currentTerm,
                    leaderId: this.nodeId,
                    prevLogIndex,
                    prevLogTerm,
                    entries,
                    leaderCommit
                }
                console.log(`Node ${this.nodeId} is sending ${payload.entries.length} entries to ${followerId}`)
                const response = follower.receiveAppendEntries(payload);
                console.log(`Node ${this.nodeId} received response from ${followerId}: ${JSON.stringify(response)}`)

                if (!response.success) {
                    this.nextIndex.find(({ nodeId }) => nodeId === followerId)!.index--;
                    this.sendEntriesToFollower(follower);
                } else {
                    this.matchIndex.find(({ nodeId }) => nodeId === followerId)!.index = lastLogIndex;
                    this.nextIndex.find(({ nodeId }) => nodeId === followerId)!.index = lastLogIndex + 1;
                }

                if (this.commitIndex < lastLogIndex) {
                    const majorityIndex = Math.floor(this.neighbors.length / 2);
                    const majorityMatchIndex = this.matchIndex.filter(({ index }) => index >= lastLogIndex).length;
                    if (majorityMatchIndex >= majorityIndex && this.log.get(lastLogIndex)?.term === this.currentTerm) {
                        this.commitIndex = lastLogIndex;
                    }
                }

            }
        }
    }


    becomeFollower(leaderId: number) {
        console.log(`Node ${this.nodeId} recognized leader ${leaderId}`)
        clearInterval(this.heartbeatInterval);
        this.state = 'follower';
        this.leaderId = leaderId;
        this.hasReceivedHeartbeat = false;
        this.electionTimeout = Math.floor(Math.random() * 150) + 150;
    }

    becomeCandidate() {
        console.log(`Node ${this.nodeId} is becoming a candidate with term ${this.currentTerm + 1}`)
        this.state = 'candidate';
        this.votes = 1;
        this.votedFor = this.nodeId;
        this.currentTerm++;
        this.requestVotes();
    }

    becomeLeader() {
        console.log(`Node ${this.nodeId} is becoming a leader`)
        clearInterval(this.electionTimeoutInterval);
        this.startSendingHeartbeat();
        this.state = 'leader';
        this.nextIndex = this.neighbors.map(neighbor => ({
            nodeId: neighbor.nodeId,
            index: this.log.last ? this.log.last.index + 1 : 0
        }))
        this.matchIndex = this.neighbors.map(neighbor => ({
            nodeId: neighbor.nodeId,
            index: 0
        }))
        this.sendEntries();
    }

    receiveClientRequest(command: string): ClientRequestResponse {
        if (this.state !== 'leader') {
            if (this.leaderId === -1) {
                return { kind: 'unavailable' };
            }
            return { kind: 'redirect', leaderId: this.leaderId };
        }

        this.log.append({
            index: this.log.last ? this.log.last.index + 1 : 0,
            term: this.currentTerm,
            command
        })

        this.sendEntries();

        return { kind: 'success' };
    }

    receiveAppendEntries(appendEntries: AppendEntryRPC): AppendEntryRPCResponse {

        if (appendEntries.term > this.currentTerm) {
            this.currentTerm = appendEntries.term;
            this.becomeFollower(appendEntries.leaderId);
        }

        /* Reply false if term < currentTerm (§5.1) */
        if (appendEntries.term < this.currentTerm) {
            return { term: this.currentTerm, success: false };
        }

        if (!appendEntries.entries.length) {
            /* Heartbeat */
            this.hasReceivedHeartbeat = true;
            if (this.state === 'candidate') {
                this.becomeFollower(appendEntries.leaderId);
            }
            /* TODO: Ack for Heartbeat? */
            return { term: this.currentTerm, success: true };
            //return sender.receiveAppendEntryResponse(this.currentTerm, true);
        }

        /* Reply false if log doesn’t contain an entry at prevLogIndex
         * whose term matches prevLogTerm (§5.3) */
        const prevLogEntry = this.log.get(appendEntries.prevLogIndex);
        if (appendEntries.prevLogIndex > -1 && (!prevLogEntry || prevLogEntry.term !== appendEntries.prevLogTerm)) {
            return { term: this.currentTerm, success: false };
        }

        /* If an existing entry conflicts with a new one (same index
         * but different terms), delete the existing entry and all that
         * follow it (§5.3) */
        for (const incomingEntry of appendEntries.entries) {
            const existingEntry = this.log.get(incomingEntry.index);
            if (existingEntry && existingEntry.term !== incomingEntry.term) {
                this.log.truncate(incomingEntry.index);
            }
        }

        /* If leaderCommit > commitIndex, set commitIndex =
         * min(leaderCommit, index of last new entry) */
        if (appendEntries.leaderCommit > this.commitIndex) {
            this.commitIndex = Math.min(appendEntries.leaderCommit, this.log.last?.index ?? 0);
        }

        /* Append any new entries not already in the log */
        for (const incomingEntry of appendEntries.entries) {
            this.log.append(incomingEntry);
        }

        /* Apply log entries to state machine */
        while (this.lastApplied < this.commitIndex) {
            this.lastApplied++;
        }

        return { term: this.currentTerm, success: true };

    }

    receiveRequestVote(requestVoteRPC: RequestVoteRPC): RequestVoteRPCResponse {

        if (requestVoteRPC.term > this.currentTerm) {
            this.currentTerm = requestVoteRPC.term;
            this.becomeFollower(requestVoteRPC.candidateId);
            return { term: this.currentTerm, voteGranted: true };
        }

        /* Reply false if term < currentTerm (§5.1) */
        if (requestVoteRPC.term < this.currentTerm) {
            return { term: this.currentTerm, voteGranted: false };
        }

        /* If votedFor is null or candidateId, and candidate’s log is at
         * least as up-to-date as receiver’s log, grant vote (§5.2, §5.4) */
        const lastLogEntry = this.log.last;
        const hasNotVotedOrAlreadyVotedForSender = this.votedFor === null || this.votedFor === requestVoteRPC.candidateId;
        const isCandidateLogUpToDate = requestVoteRPC.lastLogTerm >= (lastLogEntry?.term ?? 0) && requestVoteRPC.lastLogIndex >= (lastLogEntry?.index ?? 0);
        if (hasNotVotedOrAlreadyVotedForSender && isCandidateLogUpToDate) {
            return { term: this.currentTerm, voteGranted: true };
        }

        return { term: this.currentTerm, voteGranted: false };
    }


    requestVotes() {
        const lastLogEntry = this.log.last;
        const requestVoteRPC: RequestVoteRPC = {
            term: this.currentTerm,
            candidateId: this.nodeId,
            lastLogIndex: lastLogEntry?.index ?? 0,
            lastLogTerm: lastLogEntry?.term ?? 0
        }
        const votes = this.neighbors.map(neighbor => neighbor.receiveRequestVote(requestVoteRPC)).filter(vote => vote.voteGranted).length;
        if ((votes + 1) > this.neighbors.length / 2) {
            this.becomeLeader();
        }
    }

}