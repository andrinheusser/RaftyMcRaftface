import { Node } from "./src/Node.ts";
import { Client } from "./src/Client.ts";

const nodes: Node[] = [];

for (let i = 0; i < 5; i++) {
    const newNode = new Node(i)
    nodes.push(newNode);
}
for (const node of nodes) {
    node.addNeighbors(nodes.filter(n => n.nodeId !== node.nodeId));
}

const client = new Client(nodes);

client.command('foo');

//setInterval(() => client.info(), 1000);

await new Promise(resolve => setTimeout(resolve, 5000));

client.info();

await new Promise(resolve => setTimeout(resolve, 5000));

client.info();

await new Promise(resolve => setTimeout(resolve, 5000));

client.info();
client.command('bar');

await new Promise(resolve => setTimeout(resolve, 5000));

client.info();


