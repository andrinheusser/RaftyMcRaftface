import { Node } from "./Node.ts";

export class Client {
    leader: Node | null = null;
    nodes: Node[] = [];
    constructor(nodes: Node[]) {
        this.nodes = nodes;
    }

    setLeader(leaderId: number) {
        this.leader = this.nodes.find(node => node.nodeId === leaderId) || null;
    }

    command(cmd: string) {

        const targetNode = this.leader || this.nodes[Math.floor(Math.random() * this.nodes.length)];

        console.log('Client: Sending client command to node ' + targetNode.nodeId + ': ' + cmd)

        const response = targetNode.receiveClientRequest(cmd);

        if (response.kind === 'redirect') {
            this.setLeader(response.leaderId);
            console.log('Client: Redirecting to node ' + response.leaderId);
            this.command(cmd);
        }

        if (response.kind === 'unavailable') {
            console.log('Client: Leader unavailable, retrying in 1 second');
            setTimeout(() => this.command(cmd), 1000);
        }

    }

    info() {
        console.log('Client: Info')
        console.log(`Clinet: Leader (Node ${this.leader?.nodeId}) Stats - Term: ${this.leader?.currentTerm} - Commit Index: ${this.leader?.commitIndex}`)
        console.log(`Client: Leader Log: ${this.leader?.log.log.map(entry => entry.command + `(${entry.term}-${entry.index})`).join(', ')}`)
        for (const node of this.nodes) {
            console.log(`Client: Node ${node.nodeId} Log: ${node.log.log.map(entry => entry.command + `(${entry.term}-${entry.index})`).join(', ')}`)
        }
    }
}