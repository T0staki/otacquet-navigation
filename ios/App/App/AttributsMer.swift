import ActivityKit
import Foundation

// Données de l'affichage sur écran verrouillé pendant un enregistrement, partagées par l'appli et son extension. Jamais la position.
@available(iOS 16.1, *)
struct AttributsMer: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var milles: Double
        var reelle: Double?
        var theorique: Double?
        var pause: Bool
    }
    var debut: Date
    var bateau: String
}
