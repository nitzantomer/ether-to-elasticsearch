import Web3 = require("web3");
import * as elasticsearch from "elasticsearch";
import { Block, BlockType, Transaction } from "web3/types";

type ProcessedTransaction = Transaction & { toName: string; gasPrice: number; value: number };
type BulkEntryIndex = {
	index: {
		_index: "transactions";
		_type: "transaction";
		_id: string;
	}
}

const NODE_ADDRESS = "http://138.197.100.166:8545";
const TOKENS = (() => {
	let all = require("../../tokens-eth--small.json") as Array<{ symbol: string, name: string, address: string }>;
	return new Map<string, string>(all.map(item => [item.address, item.name] as [string, string]));
})() as Map<string, string>;

async function getLastBlockNumber(): Promise<number> {
	return await web3.eth.getBlockNumber();
}

async function getBlock(blockId?: BlockType): Promise<Block> {
	if (!blockId) {
		blockId = await getLastBlockNumber();
	}

	return await web3.eth.getBlock(blockId, true);
}

async function getTransactions(): Promise<Transaction[]> {
	let block = await getBlock();
	return block.transactions;
}

const divideBy = Math.pow(10, 9);
function processTransaction(transaction: Transaction): ProcessedTransaction {
	return Object.assign({}, transaction, {
		value: Number(transaction.value) / divideBy,
		gasPrice: Number(transaction.gasPrice) / divideBy,
		toName: TOKENS.get(transaction.to) || transaction.to
	});
}

function createBulkEntry(transaction: ProcessedTransaction): [BulkEntryIndex, ProcessedTransaction] {
	return [{
		index: {
			_index: "transactions",
			_type: "transaction",
			_id: transaction.hash
		}
	}, transaction];
}

let currentBlock: number;
const web3 = new Web3(new Web3.providers.HttpProvider(NODE_ADDRESS));
const elasticsearchClient = new elasticsearch.Client({
	host: "174.138.51.204:9200",
	log: [
		{
			type: "file",
			level: "error",
			path: "logs/elasticsearch.error.log"
		},
		{
			type: "file",
			level: "trace",
			path: "logs/elasticsearch.log"
		}
	]
});
const timer = setInterval(async () => {
	const blockNumber = await getLastBlockNumber();
	if (blockNumber === currentBlock) {
		return;
	}

	console.log(`analizying block #${ blockNumber }`);

	currentBlock = blockNumber;
	const originalTransactions = await getTransactions();

	console.log(`\tcontaining ${ originalTransactions.length } transactions`);

	const processedTransactions = originalTransactions.map(transaction => processTransaction(transaction));
	const bulkBody = processedTransactions
		.map(transaction => createBulkEntry(transaction))
		.reduce((a, b) => a.concat(b), []);

	elasticsearchClient.bulk({
		body: bulkBody
	}, (err, resp) => {
		if (err) {
			console.log("error: ", err);
		} else {
			console.log("response: ", resp);
		}
	});
}, 10000);