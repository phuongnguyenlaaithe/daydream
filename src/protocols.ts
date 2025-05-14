export interface Protocol {
    name: string;
    apy: number;
    risk: "low" | "medium" | "high";
    available: boolean;
  }
  
  export async function getProtocolsAPY(): Promise<Protocol[]> {
    return [
      { name: "CompoundV3", apy: 5.2, risk: "low", available: true },
      { name: "Aave", apy: 4.1, risk: "medium", available: true },
      { name: "Sonne Finance", apy: 6.5, risk: "high", available: false },
    ];
  }

