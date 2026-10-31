import ActivityKit
import SwiftUI
import WidgetKit

// Écran verrouillé et Dynamic Island pendant un enregistrement : durée (le système la fait avancer seul), milles, vitesse réelle, vitesse théorique.
private func nombre(_ v: Double?, _ d: Int = 1) -> String {
    guard let v = v else { return "–" }
    return String(format: "%.\(d)f", v).replacingOccurrences(of: ".", with: ",")
}
private func duree(_ debut: Date) -> Text {
    Text(timerInterval: debut...debut.addingTimeInterval(24 * 3600), countsDown: false)
}

// iOS coupe l'affichage au-delà de 160 points de haut : hauteurs fixées pour que tout tienne
@available(iOS 16.2, *)
private struct Case: View {
    let titre: String
    let valeur: Text
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(titre).font(.system(size: 16)).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.8).frame(height: 19)
            valeur.font(.system(size: 32, weight: .semibold, design: .rounded)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6).frame(height: 36)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

@available(iOS 16.2, *)
private struct EcranVerrouille: View {
    let c: ActivityViewContext<AttributsMer>
    private func noeuds(_ v: Double?) -> Text { Text(nombre(v)) + Text(" nds").font(.system(size: 16, weight: .medium)) }
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 10) {
                Image("Logo").resizable().frame(width: 34, height: 34).clipShape(RoundedRectangle(cornerRadius: 8))
                Text(c.attributes.bateau).font(.system(size: 22, weight: .bold)).lineLimit(1).minimumScaleFactor(0.7)
                Spacer()
                Text(c.state.pause ? "En pause" : "Enregistrement").font(.system(size: 15)).foregroundStyle(.secondary).lineLimit(1)
            }
            HStack(alignment: .top, spacing: 12) {
                Case(titre: "Durée", valeur: duree(c.attributes.debut))
                Case(titre: "Milles", valeur: Text(nombre(c.state.milles, 2)))
            }
            HStack(alignment: .top, spacing: 12) {
                Case(titre: "Vitesse réelle", valeur: noeuds(c.state.reelle))
                Case(titre: "Vitesse théorique", valeur: noeuds(c.state.theorique))
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 6)
    }
}

@available(iOS 16.2, *)
struct ActiviteMer: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AttributsMer.self) { c in
            EcranVerrouille(c: c)
        } dynamicIsland: { c in
            DynamicIsland {
                DynamicIslandExpandedRegion(.bottom) { EcranVerrouille(c: c) }
            } compactLeading: {
                duree(c.attributes.debut).monospacedDigit().frame(maxWidth: 56)
            } compactTrailing: {
                Text(nombre(c.state.reelle)).monospacedDigit()
            } minimal: {
                Text(nombre(c.state.reelle)).monospacedDigit()
            }
        }
    }
}

@main
struct ExtensionActivite: WidgetBundle {
    var body: some Widget {
        if #available(iOS 16.2, *) { ActiviteMer() }
    }
}
