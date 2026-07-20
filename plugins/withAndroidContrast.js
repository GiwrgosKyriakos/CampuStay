const { withAndroidStyles } = require('@expo/config-plugins');

module.exports = function withAndroidContrast(config) {
  return withAndroidStyles(config, (modConfig) => {
    const styles = modConfig.modResults;
    
    // 1. Βρίσκουμε το κεντρικό AppTheme του CampuStay
    const appTheme = styles.resources.style.find((s) => s.$.name === 'AppTheme');
    
    if (appTheme && appTheme.item) {
      // 2. Ψάχνουμε αν η Google έχει ήδη βάλει τη ρύθμιση contrast
      const contrastItem = appTheme.item.find(
        (i) => i.$ && i.$.name === 'android:enforceNavigationBarContrast'
      );
      
      if (contrastItem) {
        // 3. ΑΦΟΥ ΥΠΑΡΧΕΙ ΗΔΗ (όπως είδαμε στο screenshot), της αλλάζουμε την τιμή σε false!
        contrastItem._ = 'false';
      } else {
        // 4. Αν για κάποιο λόγο έλειπε, τη δημιουργούμε από την αρχή ως false
        appTheme.item.push({
          _: 'false',
          $: { name: 'android:enforceNavigationBarContrast' },
        });
      }
    }
    
    return modConfig;
  });
};