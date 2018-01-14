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

async function getTransactions(): Promise<Transaction[]> {
	let block = await getBlock();
	return block.transactions;
}

function normalizeNumber(num: number | string, decimals: number): number {
	if (typeof num === "string") {
		num = Number(num);
	}

	return num / Math.pow(10, decimals);
}

function shouldDecode(input: string | null) {
	return input && input !== "0x" && input !== "0x00";
}

function decode(input: string | null) {
	try {
		return web3Helper.decodeMethod(input);
	} catch(e) {
		return null;
	}
}

function processTransaction(transaction: Transaction, date: string): ProcessedTransaction {
	const token = TOKENS.get(transaction.to) || {
		symbol: "ETH",
		name: "Ether",
		decimals: 18
	};
	const decoded = decode(transaction.input);
	const overrides = {
		date,
		decodedInput: decoded,
		coin: token.symbol,
		coinName: token.name,
		value: normalizeNumber(transaction.value, 18),
		gasPrice: normalizeNumber(transaction.gasPrice, 9)
	} as Partial<ProcessedTransaction>;

	if (decoded && decoded.method.name.startsWith("transfer(")) {
		overrides.to = decoded.params.to;
		overrides.value = normalizeNumber(decoded.params.value, token.decimals) as string & number;
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

let currentBlock: Block;
const web3 = new Web3(new Web3.providers.HttpProvider(NODE_ADDRESS));
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
	const block = await getBlock();
	if (currentBlock && block.number === currentBlock.number) {
		return;
	}

	currentBlock = block;
	console.log(`analizying block #${ currentBlock.number }`);

	const originalTransactions = await getTransactions();
	const date = new Date(currentBlock.timestamp * 1000).toISOString();

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
}, 10000);
