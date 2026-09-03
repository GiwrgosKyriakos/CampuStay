import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import * as Print from "expo-print";

export interface GeneratedContractPdf {
  uri: string;
  sha256Hash: string;
  base64: string;
}

export async function generateContractPdf(htmlContent: string): Promise<GeneratedContractPdf> {
  const { uri } = await Print.printToFileAsync({
    html: htmlContent,
    base64: true,
  });

  const base64Data = await new File(uri).base64();
  const sha256Hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    base64Data,
  );

  return { uri, sha256Hash, base64: base64Data };
}