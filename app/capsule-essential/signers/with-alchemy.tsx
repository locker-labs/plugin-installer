import React from "react";
import { createCapsuleAccount, createCapsuleViemClient } from "@usecapsule/viem-v2-integration";
import { hexStringToBase64, SuccessfulSignatureRes } from "@usecapsule/web-sdk";
import { createModularAccountAlchemyClient } from "@alchemy/aa-alchemy";
import { WalletClientSigner, arbitrumSepolia, baseSepolia } from "@alchemy/aa-core";
import type { BatchUserOperationCallData, SendUserOperationResult } from "@alchemy/aa-core";
import { sepolia } from "viem/chains";
import { http, hashMessage } from "viem";
import type { WalletClient, LocalAccount, SignableMessage, Hash } from "viem";
import { encodeFunctionData } from "viem";
import { capsuleClient } from "../capsule-client";
import Example from "../../demo-ui/contracts/artifacts/Example.json";
import BatchOperationsForm from "../../demo-ui/components/batch-operations-form";
import { useBatchOperations } from "../../demo-ui/hooks/useBatchOperations";
import { pluginManagerActions } from "@account-kit/smart-contracts";

type SignWithAlchemyProps = {};

const config = {
  rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
}

const SignWithAlchemy: React.FC<SignWithAlchemyProps> = () => {
  const { userOps, txHash, loading, error, addOperation, removeOperation, updateValue, setTxHash, setLoading } =
    useBatchOperations();

  async function customSignMessage(message: SignableMessage): Promise<Hash> {
    const hashedMessage = hashMessage(message);
    const res = await capsuleClient.signMessage(
      Object.values(capsuleClient.wallets!)[0]!.id,
      hexStringToBase64(hashedMessage)
    );

    let signature = (res as SuccessfulSignatureRes).signature;

    // Fix the v value of the signature
    const lastByte = parseInt(signature.slice(-2), 16);
    if (lastByte < 27) {
      const adjustedV = (lastByte + 27).toString(16).padStart(2, "0");
      signature = signature.slice(0, -2) + adjustedV;
    }

    return `0x${signature}`;
  }

  const handleSign = async () => {
    setLoading(true);

    const viemCapsuleAccount: LocalAccount = createCapsuleAccount(capsuleClient);
    const viemClient: WalletClient = createCapsuleViemClient(capsuleClient, {
      account: viemCapsuleAccount,
      chain: sepolia,
      transport: http(config.rpcUrl),
    });

    viemClient.signMessage = async ({ message }: { message: SignableMessage }): Promise<Hash> => {
      return customSignMessage(message);
    };

    const walletClientSigner = new WalletClientSigner(viemClient as any, "capsule");

    const alchemyClient = await createModularAccountAlchemyClient({
      apiKey: process.env.NEXT_PUBLIC_REACT_APP_ALCHEMY_API_KEY,
      chain: baseSepolia,
      signer: walletClientSigner,
      gasManagerConfig: {
        policyId: process.env.NEXT_PUBLIC_REACT_APP_ALCHEMY_GAS_POLICY_ID!,
      },
    })
    
    alchemyClient.extend(pluginManagerActions);

    const demoUserOperations: BatchUserOperationCallData = userOps.map((op) => ({
      target: "0x7920b6d8b07f0b9a3b96f238c64e022278db1419" as `0x${string}`,
      data: encodeFunctionData({
        abi: Example["contracts"]["contracts/Example.sol:Example"]["abi"],
        functionName: "changeX",
        args: [BigInt(op.value)],
      }),
    }));

    const userOperationResult: SendUserOperationResult = await alchemyClient.sendUserOperation({
      uo: demoUserOperations,
    });

    setTxHash(userOperationResult.hash);
    setLoading(false);
  };

  return (
    <BatchOperationsForm
      userOps={userOps}
      onAddOperation={addOperation}
      onRemoveOperation={removeOperation}
      onValueChange={updateValue}
      onSign={handleSign}
      loading={loading}
      error={error}
      txHash={txHash}
    />
  );
};

export default SignWithAlchemy;
