import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
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

  const base64Data = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const sha256Hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    base64Data,
  );

  return { uri, sha256Hash, base64: base64Data };
}