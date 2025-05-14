import { createGroq } from "@ai-sdk/groq";
import {
  createDreams,
  context,
  render,
  action,
  validateEnv,
} from "@daydreamsai/core";
import { cli } from "@daydreamsai/core/extensions";
import { z } from "zod";
import {
  getTulipCurrentBalance,
  getTulipTotalBalance,
  calDeposit,
  calWithdraw,
} from "./src/vault.ts";
import { getProtocolsAPY } from "./src/protocols.ts";
import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();
const evmTreasuryAbi = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "module",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "value",
        "type": "uint256"
      },
      {
        "internalType": "bytes",
        "name": "data",
        "type": "bytes"
      }
    ],
    "name": "callModule",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "transferToTulip",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  }
];


const compoundV3ModuleAbi = [
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "params", type: "bytes" }
    ],
    outputs: []
  }
];

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

const evmTreasury = new ethers.Contract(
  process.env.EVMTREASURY_ADDRESS!,
  evmTreasuryAbi,
  wallet
);

const compoundV3Module = new ethers.Contract(
  process.env.COMPOUNDV3_MODULE_ADDRESS!,
  compoundV3ModuleAbi,
  wallet
);

// Load ENV
const env = validateEnv(
  z.object({
    GROQ_API_KEY: z.string().min(1, "GROQ_API_KEY is required"),
  })
);

// Model
const model = createGroq({ apiKey: env.GROQ_API_KEY })("deepseek-r1-distill-llama-70b");

// Template
const template = `
Goal: {{goal}}
Tasks:{{#each tasks}}- {{this}}{{/each}}
Current Balance: {{currentBalance}}
Total Vault: {{totalBalance}}
Liquidity Ratio: {{liquidityRatio}}
Available Protocols:{{protocols}}
Suggested Action: {{currentSuggestion}}
`.trim();

// Agent memory type
type VaultMemory = {
  goal: string;
  tasks: string[];
  currentBalance: number;
  totalBalance: number;
  liquidityRatio: number;
  protocols: string;
  currentSuggestion: string;
};

// Context
const vaultContext = context({
  type: "vault",
  schema: z.object({
    id: z.string(),
    initialGoal: z.string(),
    initialTasks: z.array(z.string()),
  }),

  key({ id }) {
    return id;
  },

  async create({ args }) {
    const current = await getTulipCurrentBalance();
    const total = await getTulipTotalBalance();
    const protocols = await getProtocolsAPY();

    return {
      goal: args.initialGoal,
      tasks: args.initialTasks,
      currentBalance: current,
      totalBalance: total,
      liquidityRatio: current / total,
      protocols: protocols
        .map((p) => `- ${p.name}: APY=${p.apy}%, Rủi ro=${p.risk}, Khả dụng=${p.available}`)
        .join("\n"),
      currentSuggestion: "Chưa có",
    };
  },

  render({ memory }) {
    return render(template, memory);
  },
});

// Actions
//To-do: ghi flow cho hàm deposit
const depositAction = action({
  name: "depositToCompound V3",
  description: "Chuyển tiền từ Tulip sang Compound V3",
  schema: z.object({}),
  async handler(_, ctx) {
    const memory = ctx.agentMemory as VaultMemory;

    const amount = await calDeposit();
    memory.currentSuggestion = `💰 Gửi ${amount} vào Compound V3`;
    console.log(`[ACTION] Gửi ${amount} đến Compound V3`);


    // ✅ Cập nhật lại số liệu sau khi gửi tiền
    memory.currentBalance = await getTulipCurrentBalance();
    memory.totalBalance = await getTulipTotalBalance();
    memory.liquidityRatio = memory.currentBalance / memory.totalBalance;

    return {};
  },
});

const withdrawAction = action({
  name: "withdrawFromCompoundV3",
  description: "Rút tiền từ Compound V3 về Tulip vault",
  schema: z.object({}),

  async handler(_, ctx) {
    const memory = ctx.agentMemory as VaultMemory;

    const amount = await calWithdraw();
    memory.currentSuggestion = `🏦 Rút ${amount} từ Compound V3`;
    console.log(`[ACTION] Rút ${amount} từ Compound V3`);


    // 1. Gọi withdraw() trên module (rút về EvmTreasury)
    const withdrawData = compoundV3Module.interface.encodeFunctionData("withdraw", ["0x"]);
    const callTx = await evmTreasury.callModule(
      compoundV3Module.target,
      0,
      withdrawData
    );
    await callTx.wait();
    console.log("✅ Đã gọi withdraw() từ Compound về Treasury");

    // 2. Gọi transferToTulip (chuyển từ Treasury về Vault)
    const transferTx = await evmTreasury.transferToTulip(5, {
      value: ethers.parseEther("0.001")
    });
    await transferTx.wait();
    console.log("✅ Đã chuyển từ Treasury về Tulip");

    // 3. Cập nhật số liệu sau khi rút
    memory.currentBalance = await getTulipCurrentBalance();
    memory.totalBalance = await getTulipTotalBalance();
    memory.liquidityRatio = memory.currentBalance / memory.totalBalance;

    return {};
  }
});

// Create and run agent
const agent = createDreams({
  model,
  context: vaultContext,
  extensions: [cli],
  actions: [depositAction, withdrawAction],
});

await agent.start({
  id: "vault-ai-agent",
  initialGoal:
    "Cứ mỗi 10 giây, agent tự động theo dõi và điều phối dòng tiền trong vault để tối ưu hóa lợi nhuận. Nếu liquidity trong vault > 30% tổng liquidity thì gửi tiền từ vault đi đầu tư. Nếu < 10% thì rút tiền về vault.",
  initialTasks: [
    "Tính toán liquidity ratio hiện tại",
    "Nếu liquidity > 30%, gửi tiền từ vault đi đầu tư",
    "Nếu liquidity < 10%, rút tiền về vault",
  ],
});

agent.send