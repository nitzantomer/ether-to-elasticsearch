import Web3 = require("web3");
import Web3Helper = require("web3-api-helper");
const web3Helper = new Web3Helper();
//import { Web3Helper } from "web3-api-helper";

import { Block, BlockType, Transaction } from "web3/types";

export type ProcessedTransaction = Transaction & {
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

export async function getLastBlockNumber(): Promise<number> {
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

export async function processBlock(block: number | Block): Promise<ProcessedTransaction[]> {
	if (typeof block === "number") {
		block = await getBlock(block);
	}
	console.log(`analizying block #${ block.number }`);

	const originalTransactions = block.transactions;
	const date = new Date(block.timestamp * 1000).toISOString();

	console.log(`\tcontaining ${ originalTransactions.length } transactions`);

	return originalTransactions.map(transaction => processTransaction(transaction, date));
}

const web3 = new Web3(new Web3.providers.HttpProvider(NODE_ADDRESS));

