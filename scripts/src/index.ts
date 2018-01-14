import Web3 = require("web3");
import Web3Helper = require("web3-api-helper");
const web3Helper = new Web3Helper();

import * as elasticsearch from "elasticsearch";
import { Block, BlockType, Transaction } from "web3/types";

type ProcessedTransaction = Transaction & {
	date: string;
	value: number;
	gasPrice: number;
	coin: string;
	coinName: string;
	function: string;
	params: any;
	decodedInput: any;
	sender: string;	// message sender incase of transferFrom from != sender
};

type BulkEntryIndex = {
	index: {
		_index: "transactions";
		_type: "transaction";
		_id: string;
	}
}

type Token = {
	name: string;
	symbol: string;
	address: string;
	decimals: number;
}

const NODE_ADDRESS = `http://${process.env.PARITY}`;
const TOKENS = (() => {
	let all = require("../../tokens-eth--small.json") as Array<Token>;
	return new Map<string, Token>(all.map(item => [item.address, item] as [string, Token]));
})() as Map<string, Token>;

async function getLastBlockNumber(): Promise<number> {
	return await web3.eth.getBlockNumber();
}

async function getBlock(blockId?: BlockType): Promise<Block> {
	if (!blockId) {
		blockId = await getLastBlockNumber();
	}

	return await web3.eth.getBlock(blockId, true);
}

function normalizeNumber(num: number | string, decimals: number): number {
	if (typeof num === "string") {
		num = Number(num);
	}

	return num / Math.pow(10, decimals);
}

function decode(input: string | null) {
	try {
		return web3Helper.decodeMethod(input);
	} catch(e) {
		return null;
	}
}

function processTransaction(transaction: Transaction, date: string): ProcessedTransaction {
	const decoded = decode(transaction.input);
	const overrides = {
		date,
		coin: "ETH",
		coinName: "Ether",
		decodedInput: decoded,
		sender: transaction.from,
		value: normalizeNumber(transaction.value, 18),
		gasPrice: normalizeNumber(transaction.gasPrice, 9)
	} as Partial<ProcessedTransaction>;

	if (decoded && decoded.method.name.startsWith("transfer")) {
		const token = TOKENS.get(transaction.to) || {
			symbol: "<UNK>",
			name: "Unknown",
			decimals: 18
		};

		overrides.coin = token.symbol;
		overrides.coinName = token.name;
		overrides.to = decoded.params.to;
		overrides.value = normalizeNumber(decoded.params.value, token.decimals) as string & number;

		if (decoded.method.name.startsWith("transferFrom(")) {
			overrides.from = decoded.params.from;
		}
	}

	return Object.assign({}, transaction, overrides) as ProcessedTransaction;
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

function getErrorMessage(error: any): string {
	if (error instanceof Error) {
		return error.message;
	}

	if (typeof error === "string") {
		return error;
	}

	return error.toString();
}

async function processBlock(block: Block) {
	console.log(`analizying block #${ block.number }`);

	const originalTransactions = block.transactions;
	const date = new Date(block.timestamp * 1000).toISOString();

	console.log(`\tcontaining ${ originalTransactions.length } transactions`);

	const processedTransactions = originalTransactions.map(transaction => processTransaction(transaction, date));
	const bulkBody = processedTransactions
		.map(transaction => createBulkEntry(transaction))
		.reduce((a, b) => a.concat(b), []);

	elasticsearchClient.bulk({
		body: bulkBody
	}, (err, resp) => {
		if (err) {
			console.log("\terror sending bulk: ", err);
		} else {
			console.log("\tbulk sent successfully");
		}
	});
}

let currentBlockNumber: number;
const web3 = new Web3(new Web3.providers.HttpProvider(NODE_ADDRESS));

console.log(`connecting to elasticsearch at: ${ process.env.ELASTICSEARCH }`);
const elasticsearchClient = new elasticsearch.Client({
	host: process.env.ELASTICSEARCH,
	/*log: [
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
	]*/
});

const timer = setInterval(async () => {
	console.log("\nchecking last block")
	const latestBlockNumber = await getLastBlockNumber();

	if (!currentBlockNumber) {
		currentBlockNumber = latestBlockNumber - 1;
	}

	for (let i = currentBlockNumber + 1; i <= latestBlockNumber; i++) {
		try {
			await processBlock(await getBlock(i));
			currentBlockNumber = i;
		} catch (e) {
			console.log("failed to retrieve last block: ", getErrorMessage(e));
			return;
		}
	}
}, 10000);
