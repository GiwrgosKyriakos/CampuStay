import os
from PIL import Image, ImageOps

# ---------------------------------------------------------
# ΡΥΘΜΙΣΕΙΣ
# ---------------------------------------------------------
INPUT_FILENAME = "photo.png"
OUTPUT_FILENAME = "photo_1024x500.png"
TARGET_SIZE = (1024, 500)

# ---------------------------------------------------------
# ΕΠΕΞΕΡΓΑΣΙΑ ΕΙΚΟΝΑΣ
# ---------------------------------------------------------
if not os.path.exists(INPUT_FILENAME):
    print(f"⚠️ Σφάλμα: Το αρχείο '{INPUT_FILENAME}' δεν βρέθηκε στον φάκελο του script.")
else:
    try:
        with Image.open(INPUT_FILENAME) as img:
            # Το ImageOps.fit προσαρμόζει την εικόνα στις διαστάσεις (1024, 500)
            # με βάση το κέντρο της centering=(0.5, 0.5) χωρίς να την παραμορφώνει.
            resized_img = ImageOps.fit(
                img,
                TARGET_SIZE,
                method=Image.Resampling.LANCZOS,
                centering=(0.5, 0.5)
            )
            
            # Αποθήκευση σε νέο αρχείο για να μην αντικατασταθεί το αρχικό
            resized_img.save(OUTPUT_FILENAME, quality=100)
            print(f"✅ Η εικόνα μετατράπηκε επιτυχώς σε 1024x500!")
            print(f"📁 Νέο αρχείο: {OUTPUT_FILENAME}")
            
    except Exception as e:
        print(f"⚠️ Προέκυψε σφάλμα κατά την επεξεργασία της εικόνας: {e}")