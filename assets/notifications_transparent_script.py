import os
from PIL import Image


def convert_logo_to_notification_icon(input_path, output_path):
    if not os.path.exists(input_path):
        print(f"❌ Σφάλμα: Το αρχείο '{input_path}' δεν βρέθηκε στον φάκελο!")
        return

    # 1. Άνοιγμα της εικόνας σε RGBA mode (Red, Green, Blue, Alpha)
    img = Image.open(input_path).convert("RGBA")

    # 2. Διαχωρισμός των καναλιών της εικόνας
    r, g, b, alpha = img.split()

    # 3. Δημιουργία μιας νέας, στερεής ολόλευκης εικόνας με τις ίδιες ακριβώς διαστάσεις
    white_canvas = Image.new("RGBA", img.size, (255, 255, 255, 255))

    # 4. «Κούμπωμα» του αρχικού χάρτη διαφάνειας (alpha) πάνω στην ολόλευκη εικόνα
    white_canvas.putalpha(alpha)

    # 5. Αποθήκευση του νέου έτοιμου asset σε μορφή PNG
    white_canvas.save(output_path, "PNG")
    print(f"🎯 Επιτυχία! Το ολόλευκο asset αποθηκεύτηκε ως: '{output_path}'")


# Εκτέλεση του script
convert_logo_to_notification_icon(
    "campuStayLogoTransparent.png", "notification_icon.png"
)