import os
from PIL import Image

def resize_and_center_logo():
    # Ρυθμίσεις
    filename = "campuStayLogoTransparent.png"
    # Αυτό θα είναι το τελικό όνομα της νέας, μικρότερης εικόνας
    output_filename = "campuStayLogoTransparent_centered.png" 
    
    # Πόσο μικρότερο θέλεις το logo (π.χ. 0.70 σημαίνει το 70% του αρχικού μεγέθους)
    # Αλλάζεις αυτή την τιμή αν το θέλεις ακόμα μικρότερο ή μεγαλύτερο
    scale_factor = 0.70 

    if not os.path.exists(filename):
        print(f"Σφάλμα: Δεν βρέθηκε το αρχείο '{filename}' στον τρέχοντα φάκελο.")
        return

    try:
        # 1. Άνοιξε την αρχική εικόνα
        img = Image.open(filename)
        
        # Σιγουρευόμαστε ότι η εικόνα έχει transparent κανάλι (RGBA)
        if img.mode != 'RGBA':
            print(f"Η εικόνα {filename} δεν έχει transparency, την μετατρέπουμε σε RGBA.")
            img = img.convert('RGBA')
            
        orig_width, orig_height = img.size
        print(f"Αρχικές διαστάσεις: {orig_width}x{orig_height} pixels.")

        # 2. Υπολόγισε τις νέες, μικρότερες διαστάσεις για το logo
        new_width = int(orig_width * scale_factor)
        new_height = int(orig_height * scale_factor)
        print(f"Νέες διαστάσεις logo: {new_width}x{new_height} pixels.")

        # 3. Κάνε resize το logo (χρησιμοποιώντας LANCZOS για υψηλή ποιότητα)
        smaller_logo = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

        # 4. Δημιούργησε ένα νέο, τελείως διάφανο καμβά με τις ΑΡΧΙΚΕΣ διαστάσεις
        # Το '0, 0, 0, 0' σημαίνει fully transparent black
        canvas = Image.new("RGBA", (orig_width, orig_height), (0, 0, 0, 0))

        # 5. Υπολόγισε τη θέση (x, y) ώστε το μικρότερο logo να είναι κεντραρισμένο
        paste_x = (orig_width - new_width) // 2
        paste_y = (orig_height - new_height) // 2

        # 6. Επικόλλησε το μικρότερο logo πάνω στον διάφανο καμβά
        # Χρησιμοποιούμε το smaller_logo ως mask για να διατηρήσουμε τη δική του διαφάνεια
        canvas.paste(smaller_logo, (paste_x, paste_y), smaller_logo)

        # 7. Αποθήκευσε τη νέα εικόνα
        canvas.save(output_filename)
        print(f"Επιτυχία! Η νέα εικόνα αποθηκεύτηκε ως '{output_filename}'.")
        print(f"Η εικόνα έχει τις ίδιες συνολικές διαστάσεις, αλλά το logo είναι κεντραρισμένο και μικρότερο.")

    except Exception as e:
        print(f"Παρουσιάστηκε σφάλμα: {e}")

if __name__ == "__main__":
    resize_and_center_logo()