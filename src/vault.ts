// import { Provider, Contract, json } from "starknet";
// import abi from "./abi/vault_abi.json"; // đường dẫn ABI contract Vault

// // Sử dụng RPC của Testnet
// const provider = new Provider({
//   rpc: {
//     nodeUrl: "https://starknet-testnet.infura.io/v3/YOUR_INFURA_KEY" // testnet URL
//   }
// });

// // Địa chỉ contract trên Testnet (bạn cần thay bằng đúng địa chỉ thật của bạn)
// const VAULT_ADDRESS = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

// const contract = new Contract(abi, VAULT_ADDRESS, provider);

// // Lấy liquidity hiện tại từ contract
// export async function getTulipCurrentBalance(): Promise<number> {
//   const result = await contract.get_current_liquidity();
//   return Number(result.toString()); // có thể dùng BigInt nếu số lớn
// }

// // Lấy tổng số dư vault
// export async function getTulipTotalBalance(): Promise<number> {
//   const result = await contract.get_total_balance();
//   return Number(result.toString());
// }


const ESTIMATE_FEE = 0.005; // Ví dụ: phí 0.5%

//To-do: get 
export async function getTulipCurrentBalance(): Promise<number> {
  return 3000; // giả lập, thay bằng gọi hợp đồng thật
}

export async function getTulipTotalBalance(): Promise<number> {
  return 4000; // giả lập
}

export async function calDeposit(): Promise<number> {
  const current = await getTulipCurrentBalance();
  const total = await getTulipTotalBalance();

  let deposit = 0;
  if (current > 0.3 * total) {
    deposit = current - 0.2 * total + 0.2 * ESTIMATE_FEE;
  }
  return Math.round(deposit * 1e6) / 1e6;
}

export async function calWithdraw(): Promise<number> {
  const current = await getTulipCurrentBalance();
  const total = await getTulipTotalBalance();

  let withdraw = 0;
  if (current < 0.1 * total) {
    withdraw = 0.2 * total - current + ESTIMATE_FEE;
  }
  return Math.round(withdraw * 1e6) / 1e6;
}
