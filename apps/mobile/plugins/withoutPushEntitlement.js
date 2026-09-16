const { withEntitlementsPlist } = require('expo/config-plugins');

/**
 * Retire le droit `aps-environment` que le module de notifications ajoute
 * d'office.
 *
 * Kaizen n'envoie que des notifications LOCALES : programmées par l'appareil,
 * elles ne passent jamais par les serveurs d'Apple et n'ont pas besoin de ce
 * droit. Le module, lui, ne fait pas la différence et le déclare quand même,
 * ce qui a fait échouer le build 1.1.0 (6) :
 *
 *   Provisioning profile "Kaizen Supotsu App Store" doesn't support the
 *   Push Notifications capability.
 *
 * Le laisser imposerait d'activer la capacité Push chez Apple et de
 * régénérer le profil de signature, pour une fonctionnalité qu'on n'utilise
 * pas. Le jour où les notifications distantes arriveront, il suffira de
 * retirer ce plugin.
 *
 * Doit rester le DERNIER plugin de la liste : il défait ce que le précédent a
 * ajouté.
 */
module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults['aps-environment'];
    return cfg;
  });
};
