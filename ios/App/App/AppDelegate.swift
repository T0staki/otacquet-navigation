import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

// MARK: - O'Tacquet : module natif « Bord » (V0.2, 25/10/2026)
// Code ajouté dans ce fichier pour ne pas toucher au projet Xcode : il est compilé avec l'appli.
// - lecture du B&G Vulcan 7R : NMEA 0183 en TCP (192.168.76.1:10110 sur le point d'accès du Vulcan), reconnexion automatique ;
// - GPS de l'iPhone, qui continue écran verrouillé (indicateur bleu de localisation) ;
// - partage d'un fichier (GPX, CSV) par la feuille de partage d'iOS (Fichiers, AirDrop, Mail…).
// Côté page : const Bord = Capacitor.registerPlugin('Bord') ; événements « nmea », « etat », « position », « etatgps ».

import Network
import CoreLocation

class OTViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(BordPlugin())
    }
}

@objc(BordPlugin)
public class BordPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "BordPlugin"
    public let jsName = "Bord"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startLocation", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopLocation", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise)
    ]

    // --- NMEA 0183 en TCP
    private var conn: NWConnection?
    private var buffer = Data()
    private let queue = DispatchQueue(label: "otacquet.nmea")
    private var host = "192.168.76.1"
    private var port: UInt16 = 10110
    private var wanted = false

    @objc func connect(_ call: CAPPluginCall) {
        let h = call.getString("host") ?? "192.168.76.1"
        let p = call.getInt("port") ?? 10110
        queue.async {
            self.host = h
            self.port = UInt16(clamping: p)
            self.wanted = true
            self.open()
        }
        call.resolve()
    }

    @objc func disconnect(_ call: CAPPluginCall) {
        queue.async {
            self.wanted = false
            self.conn?.cancel()
            self.conn = nil
            self.buffer.removeAll()
            self.notifyListeners("etat", data: ["etat": "arrete"])
        }
        call.resolve()
    }

    private func open() {
        conn?.cancel()
        buffer.removeAll()
        guard let p = NWEndpoint.Port(rawValue: port) else {
            notifyListeners("etat", data: ["etat": "erreur", "erreur": "port invalide"])
            return
        }
        let c = NWConnection(host: NWEndpoint.Host(host), port: p, using: .tcp)
        c.stateUpdateHandler = { [weak self] st in
            guard let self = self else { return }
            switch st {
            case .ready:
                self.notifyListeners("etat", data: ["etat": "connecte", "hote": self.host])
                self.receive(on: c)
            case .waiting(let e):
                self.notifyListeners("etat", data: ["etat": "attente", "erreur": "\(e)"])
            case .failed(let e):
                self.notifyListeners("etat", data: ["etat": "erreur", "erreur": "\(e)"])
                self.retry()
            default:
                break
            }
        }
        conn = c
        notifyListeners("etat", data: ["etat": "connexion", "hote": host])
        c.start(queue: queue)
    }

    private func retry() {
        guard wanted else { return }
        queue.asyncAfter(deadline: .now() + 3) { [weak self] in
            guard let self = self, self.wanted else { return }
            self.open()
        }
    }

    private func receive(on c: NWConnection) {
        c.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, done, err in
            guard let self = self else { return }
            if let d = data, !d.isEmpty {
                self.buffer.append(d)
                self.flush()
            }
            if done || err != nil {
                self.notifyListeners("etat", data: ["etat": "coupe"])
                c.cancel()
                self.retry()
                return
            }
            self.receive(on: c)
        }
    }

    private func flush() {
        var lines: [String] = []
        while let nl = buffer.firstIndex(of: 0x0A) {
            let lineData = buffer.subdata(in: buffer.startIndex..<nl)
            buffer.removeSubrange(buffer.startIndex...nl)
            if let s = String(data: lineData, encoding: .isoLatin1)?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty {
                lines.append(s)
            }
        }
        if buffer.count > 65536 { buffer.removeAll() }
        if !lines.isEmpty { notifyListeners("nmea", data: ["lignes": lines.joined(separator: "\n")]) }
    }

    // --- GPS de l'iPhone, écran verrouillé compris
    private var lm: CLLocationManager?

    @objc func startLocation(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let m = self.lm ?? CLLocationManager()
            m.delegate = self
            m.desiredAccuracy = kCLLocationAccuracyBest
            m.distanceFilter = kCLDistanceFilterNone
            m.activityType = .otherNavigation
            m.pausesLocationUpdatesAutomatically = false
            m.allowsBackgroundLocationUpdates = true
            m.showsBackgroundLocationIndicator = true
            self.lm = m
            m.requestWhenInUseAuthorization()
            m.startUpdatingLocation()
            call.resolve()
        }
    }

    @objc func stopLocation(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.lm?.stopUpdatingLocation()
            call.resolve()
        }
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for l in locations {
            var d: [String: Any] = [
                "t": l.timestamp.timeIntervalSince1970 * 1000,
                "lat": l.coordinate.latitude,
                "lon": l.coordinate.longitude,
                "acc": l.horizontalAccuracy
            ]
            if l.speed >= 0 { d["sog"] = l.speed * 3600.0 / 1852.0 }
            if l.course >= 0 { d["cog"] = l.course }
            notifyListeners("position", data: d)
        }
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        notifyListeners("etatgps", data: ["etat": "erreur", "erreur": error.localizedDescription])
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let s: String
        switch manager.authorizationStatus {
        case .authorizedAlways: s = "toujours"
        case .authorizedWhenInUse: s = "en-utilisation"
        case .denied: s = "refuse"
        case .restricted: s = "restreint"
        default: s = "a-demander"
        }
        notifyListeners("etatgps", data: ["etat": s])
    }

    // --- Partage d'un fichier texte (GPX, CSV)
    // un fichier (nom, contenu) ou plusieurs d'un coup (fichiers : [{nom, contenu}]), dans la même fenêtre de partage
    @objc func share(_ call: CAPPluginCall) {
        var liste: [(String, String)] = []
        if let f = call.getArray("fichiers") as? [[String: Any]] {
            for x in f { liste.append(((x["nom"] as? String) ?? "trace.txt", (x["contenu"] as? String) ?? "")) }
        } else {
            liste.append((call.getString("nom") ?? "trace.txt", call.getString("contenu") ?? ""))
        }
        var urls: [URL] = []
        for (nom, texte) in liste {
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(nom.replacingOccurrences(of: "/", with: "-"))
            do { try texte.write(to: url, atomically: true, encoding: .utf8) } catch { call.reject("Écriture du fichier impossible"); return }
            urls.append(url)
        }
        DispatchQueue.main.async {
            guard let vc = self.bridge?.viewController else { call.reject("Pas de vue"); return }
            let sheet = UIActivityViewController(activityItems: urls, applicationActivities: nil)
            sheet.popoverPresentationController?.sourceView = vc.view
            vc.present(sheet, animated: true) { call.resolve() }
        }
    }
}
