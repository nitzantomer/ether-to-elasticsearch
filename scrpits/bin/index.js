"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const Web3 = require("web3");
const elasticsearch = require("elasticsearch");
const NODE_ADDRESS = "http://138.197.100.166:8545";
const TOKENS = (() => {
    let all = require("../../tokens-eth--small.json");
    return new Map(all.map(item => [item.address, item.name]));
})();
function getLastBlockNumber() {
    return __awaiter(this, void 0, void 0, function* () {
        return yield web3.eth.getBlockNumber();
    });
}
function getBlock(blockId) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!blockId) {
            blockId = yield getLastBlockNumber();
        }
        return yield web3.eth.getBlock(blockId, true);
    });
}
function getTransactions() {
    return __awaiter(this, void 0, void 0, function* () {
        let block = yield getBlock();
        return block.transactions;
    });
}
const divideBy = Math.pow(10, 9);
function processTransaction(transaction) {
    return Object.assign({}, transaction, {
        value: Number(transaction.value) / divideBy,
        gasPrice: Number(transaction.gasPrice) / divideBy,
        toName: TOKENS.get(transaction.to) || transaction.to
    });
}
function createBulkEntry(transaction) {
    return [{
            index: {
                _index: "transactions",
                _type: "transaction",
                _id: transaction.hash
            }
        }, transaction];
}
let currentBlock;
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
const timer = setInterval(() => __awaiter(this, void 0, void 0, function* () {
    const blockNumber = yield getLastBlockNumber();
    if (blockNumber === currentBlock) {
        return;
    }
    console.log(`analizying block #${blockNumber}`);
    currentBlock = blockNumber;
    const originalTransactions = yield getTransactions();
    console.log(`\tcontaining ${originalTransactions.length} transactions`);
    const processedTransactions = originalTransactions.map(transaction => processTransaction(transaction));
    const bulkBody = processedTransactions
        .map(transaction => createBulkEntry(transaction))
        .reduce((a, b) => a.concat(b), []);
    elasticsearchClient.bulk({
        body: bulkBody
    }, (err, resp) => {
        if (err) {
            console.log("error: ", err);
        }
        else {
            console.log("response: ", resp);
        }
    });
}), 10000);
//# sourceMappingURL=index.js.map