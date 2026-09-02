import { Linking } from "react-native";

export function sendPropertyProposalViaMessaging(
  platform: "whatsapp" | "viber" | "sms",
  phoneNumber: string,
  property: { title: string; price: number; shareUrl: string },
) {
  const message = `Γεια σας! Σας προτείνουμε το ακίνητο «${property.title}» στα €${property.price}. Δείτε λεπτομέρειες και 360° tour εδώ: ${property.shareUrl}`;
  const encoded = encodeURIComponent(message);

  if (platform === "whatsapp") {
    return Linking.openURL(`whatsapp://send?phone=${phoneNumber}&text=${encoded}`);
  }

  if (platform === "viber") {
    return Linking.openURL(`viber://chat?number=${phoneNumber}&draft=${encoded}`);
  }

  return Linking.openURL(`sms:${phoneNumber}?body=${encoded}`);
}
