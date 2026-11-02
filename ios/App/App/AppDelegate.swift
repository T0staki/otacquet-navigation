import UIKit
import Capacitor
import Security
import ActivityKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Notifications du carnet de bord : le délégué doit être posé avant la fin du lancement, pour recevoir aussi le toucher qui ouvre l'appli
        UNUserNotificationCenter.current().delegate = OTNotifs.shared
        return true
    }

    // adresse de l'iPhone pour les notifications (jeton APNs), transmise au module « Bord »
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        OTNotifs.shared.jeton(deviceToken.map { String(format: "%02x", $0) }.joined(), erreur: nil)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        OTNotifs.shared.jeton(nil, erreur: error.localizedDescription)
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
// Côté page : const Bord = Capacitor.registerPlugin('Bord') ; événements « nmea », « etat », « position », « etatgps »,
// et pour le carnet de bord « jetonNotif », « notifTouchee » (méthode notifications).

import Network
import CoreLocation
import UserNotifications
import Speech
import AVFoundation

// Notifications du carnet de bord (V0.8, 29/10/2026) : affichées même appli ouverte ; un toucher ouvre la tâche
// (événement « notifTouchee » gardé jusqu'à ce que la page l'écoute, appli lancée par le toucher comprise).
class OTNotifs: NSObject, UNUserNotificationCenterDelegate {
    static let shared = OTNotifs()
    weak var plugin: BordPlugin?
    var dernierJeton: [String: Any]?
    var toucheeEnAttente: String?
    func jeton(_ j: String?, erreur: String?) {
        #if DEBUG
        let env = "sandbox"
        #else
        let env = "production"
        #endif
        dernierJeton = j != nil ? ["jeton": j!, "environnement": env] : ["erreur": erreur ?? "inconnue"]
        plugin?.envoyerJeton()
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        if let t = response.notification.request.content.userInfo["tache"] as? String {
            if let p = plugin { p.ouvrirTache(t) } else { toucheeEnAttente = t }
        }
        completionHandler()
    }
}

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
        CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "notifications", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "secretLire", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "secretEcrire", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "activiteMaj", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "activiteFin", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "vulcanEnvoi", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "dicterDebut", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "dicterFin", returnType: CAPPluginReturnPromise)
    ]

    override public func load() {
        OTNotifs.shared.plugin = self
        if let t = OTNotifs.shared.toucheeEnAttente { OTNotifs.shared.toucheeEnAttente = nil; ouvrirTache(t) }
    }

    // --- Écran verrouillé pendant un enregistrement : créé au premier appel, mis à jour ensuite. Jamais la position.
    @objc func activiteMaj(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(); return }
        let etat = AttributsMer.ContentState(milles: call.getDouble("milles") ?? 0, reelle: call.getDouble("reelle"), theorique: call.getDouble("theorique"), pause: call.getBool("pause") ?? false)
        let contenu = ActivityContent(state: etat, staleDate: nil)
        if let a = Activity<AttributsMer>.activities.first {
            Task { await a.update(contenu); call.resolve() }
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { call.reject("activités en direct désactivées : Réglages › O'Tacquet › Activités en direct"); return }
        let attributs = AttributsMer(debut: Date(timeIntervalSince1970: (call.getDouble("debut") ?? Date().timeIntervalSince1970 * 1000) / 1000), bateau: call.getString("bateau") ?? "")
        do { _ = try Activity.request(attributes: attributs, content: contenu, pushType: nil); call.resolve() }
        catch { call.reject("\(error)") }
    }
    @objc func activiteFin(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(); return }
        Task {
            for a in Activity<AttributsMer>.activities { await a.end(nil, dismissalPolicy: .immediate) }
            call.resolve()
        }
    }

    // --- Identité du téléphone pour le carnet de bord, gardée dans le trousseau : elle survit à la page et à une réinstallation
    private func requeteSecret(_ cle: String) -> [String: Any] {
        return [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "otacquet-carnet", kSecAttrAccount as String: cle]
    }
    @objc func secretLire(_ call: CAPPluginCall) {
        var q = requeteSecret(call.getString("cle") ?? ""); q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var res: AnyObject?
        if SecItemCopyMatching(q as CFDictionary, &res) == errSecSuccess, let d = res as? Data, let t = String(data: d, encoding: .utf8) { call.resolve(["valeur": t]) } else { call.resolve([:]) }
    }
    @objc func secretEcrire(_ call: CAPPluginCall) {
        let q = requeteSecret(call.getString("cle") ?? ""), d = Data((call.getString("valeur") ?? "").utf8)
        var s = SecItemUpdate(q as CFDictionary, [kSecValueData as String: d] as CFDictionary)
        if s == errSecItemNotFound {
            var a = q; a[kSecValueData as String] = d; a[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            s = SecItemAdd(a as CFDictionary, nil)
        }
        if s == errSecSuccess { call.resolve() } else { call.reject("trousseau : \(s)") }
    }

    // --- Notifications du carnet de bord (appli O'Tacquet seulement) : autorisation, puis adresse de l'iPhone
    @objc func notifications(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { ok, err in
            if ok { DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() } }
            call.resolve(["autorise": ok, "erreur": err?.localizedDescription ?? ""])
        }
    }
    func envoyerJeton() { if let d = OTNotifs.shared.dernierJeton { notifyListeners("jetonNotif", data: d, retainUntilConsumed: true) } }
    func ouvrirTache(_ t: String) { notifyListeners("notifTouchee", data: ["tache": t], retainUntilConsumed: true) }

    // --- NMEA 0183 en TCP
    private var conn: NWConnection?
    private var buffer = Data()
    private let queue = DispatchQueue(label: "otacquet.nmea")
    private var enAttente: [String] = [], envoiPrevu = false   // phrases du B&G regroupées une fois par seconde, pour la batterie
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
            self.ouvrirVulcan()
        }
        call.resolve()
    }

    @objc func disconnect(_ call: CAPPluginCall) {
        queue.async {
            self.wanted = false
            self.conn?.cancel()
            self.conn = nil
            self.buffer.removeAll()
            self.ws?.cancel()
            self.ws = nil
            self.notifyListeners("etat", data: ["etat": "arrete"])
            self.notifyListeners("vulcanEtat", data: ["etat": "arrete"])
        }
        call.resolve()
    }

    // --- Port 2053 du Vulcan (websocket, protocole non officiel) : deux valeurs par seconde pour l'affichage et les relevés.
    // Lecture seule : seuls DataInfoReq, DataReq et UnsubscribeData peuvent partir (voir www/gofree.js) ; tout autre message est refusé ici.
    private var ws: NWConnection?
    private var vulcanRecu: [String] = [], vulcanPrevu = false
    private let vulcanPermis: Set<String> = ["DataInfoReq", "DataReq", "UnsubscribeData"]

    private func ouvrirVulcan() {
        ws?.cancel()
        guard let url = URL(string: "ws://\(host):2053/") else { return }
        let o = NWProtocolWebSocket.Options()
        o.autoReplyPing = true
        let p = NWParameters.tcp
        p.defaultProtocolStack.applicationProtocols.insert(o, at: 0)
        let c = NWConnection(to: .url(url), using: p)
        c.stateUpdateHandler = { [weak self] st in
            guard let self = self else { return }
            switch st {
            case .ready:
                self.notifyListeners("vulcanEtat", data: ["etat": "connecte"])
                self.recevoirVulcan(c)
            case .failed(let e):
                self.notifyListeners("vulcanEtat", data: ["etat": "erreur", "erreur": "\(e)"])
                self.relancerVulcan(c)
            default:
                break
            }
        }
        ws = c
        c.start(queue: queue)
    }

    private func relancerVulcan(_ c: NWConnection) {
        c.cancel()
        guard wanted else { return }
        queue.asyncAfter(deadline: .now() + 5) { [weak self] in
            guard let self = self, self.wanted, self.ws === c else { return }
            self.ouvrirVulcan()
        }
    }

    private func recevoirVulcan(_ c: NWConnection) {
        c.receiveMessage { [weak self] data, ctx, _, err in
            guard let self = self else { return }
            if err != nil {
                self.notifyListeners("vulcanEtat", data: ["etat": "coupe"])
                self.relancerVulcan(c)
                return
            }
            if let d = data, let m = ctx?.protocolMetadata(definition: NWProtocolWebSocket.definition) as? NWProtocolWebSocket.Metadata,
               m.opcode == .text, let t = String(data: d, encoding: .utf8) {
                self.vulcanRecu.append(t)
                if self.vulcanRecu.count > 400 { self.vulcanRecu.removeFirst(self.vulcanRecu.count - 400) }
                if !self.vulcanPrevu {   // regroupés deux fois par seconde, pour la batterie
                    self.vulcanPrevu = true
                    self.queue.asyncAfter(deadline: .now() + 0.5) { [weak self] in
                        guard let self = self else { return }
                        self.vulcanPrevu = false
                        let l = self.vulcanRecu; self.vulcanRecu.removeAll()
                        if !l.isEmpty { self.notifyListeners("vulcan", data: ["messages": l]) }
                    }
                }
            }
            self.recevoirVulcan(c)
        }
    }

    @objc func vulcanEnvoi(_ call: CAPPluginCall) {
        let t = call.getString("texte") ?? ""
        guard let d = t.data(using: .utf8), let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
              o.count == 1, let k = o.keys.first, vulcanPermis.contains(k) else { call.reject("message refusé : lecture seule"); return }
        queue.async {
            guard let c = self.ws else { call.reject("Vulcan non connecté"); return }
            let m = NWProtocolWebSocket.Metadata(opcode: .text)
            let ctx = NWConnection.ContentContext(identifier: "envoi", metadata: [m])
            c.send(content: d, contentContext: ctx, isComplete: true, completion: .contentProcessed { e in
                if let e = e { call.reject("\(e)") } else { call.resolve() }
            })
        }
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
        guard !lines.isEmpty else { return }
        enAttente.append(contentsOf: lines)
        if enAttente.count > 2000 { enAttente.removeFirst(enAttente.count - 2000) }
        guard !envoiPrevu else { return }
        envoiPrevu = true
        queue.asyncAfter(deadline: .now() + 1) { [weak self] in
            guard let self = self else { return }
            self.envoiPrevu = false
            let l = self.enAttente; self.enAttente.removeAll()
            if !l.isEmpty { self.notifyListeners("nmea", data: ["lignes": l.joined(separator: "\n")]) }
        }
    }

    // --- Dictée des notes de bord (02/11/2026) : reconnaissance vocale en français, sur le téléphone quand il le permet ; seul le texte
    // repart vers la page (événement « dictee » : texte, fin, erreur). Rien n'est enregistré ni envoyé ailleurs.
    private let dicteur = SFSpeechRecognizer(locale: Locale(identifier: "fr-FR"))
    private var dicteeMoteur: AVAudioEngine?
    private var dicteeDemande: SFSpeechAudioBufferRecognitionRequest?
    private var dicteeTache: SFSpeechRecognitionTask?

    @objc func dicterDebut(_ call: CAPPluginCall) {
        SFSpeechRecognizer.requestAuthorization { st in
            guard st == .authorized else { call.reject("reconnaissance vocale refusée : Réglages › O'Tacquet ou Bord › Reconnaissance vocale"); return }
            AVAudioSession.sharedInstance().requestRecordPermission { ok in
                guard ok else { call.reject("micro refusé : Réglages › O'Tacquet ou Bord › Micro"); return }
                DispatchQueue.main.async {
                    do { try self.lancerDictee(); call.resolve() } catch { self.finirDictee(); call.reject("\(error.localizedDescription)") }
                }
            }
        }
    }
    @objc func dicterFin(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.dicteeDemande?.endAudio(); self.finirDictee(); call.resolve() }
    }
    private func lancerDictee() throws {
        finirDictee()
        guard let r = dicteur, r.isAvailable else { throw NSError(domain: "dictee", code: 1, userInfo: [NSLocalizedDescriptionKey: "reconnaissance vocale indisponible"]) }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement, options: .duckOthers)
        try session.setActive(true, options: .notifyOthersOnDeactivation)
        let demande = SFSpeechAudioBufferRecognitionRequest()
        demande.shouldReportPartialResults = true
        if r.supportsOnDeviceRecognition { demande.requiresOnDeviceRecognition = true }   // sur le téléphone : marche sans réseau, rien ne part chez Apple
        let moteur = AVAudioEngine(), entree = moteur.inputNode
        entree.installTap(onBus: 0, bufferSize: 1024, format: entree.outputFormat(forBus: 0)) { b, _ in demande.append(b) }
        moteur.prepare(); try moteur.start()
        dicteeMoteur = moteur; dicteeDemande = demande
        dicteeTache = r.recognitionTask(with: demande) { [weak self] res, err in
            guard let self = self else { return }
            let fin = (res?.isFinal ?? false) || err != nil
            var d: [String: Any] = ["texte": res?.bestTranscription.formattedString ?? "", "fin": fin]
            if let e = err, res == nil { d["erreur"] = e.localizedDescription }
            self.notifyListeners("dictee", data: d)
            if fin { DispatchQueue.main.async { self.finirDictee() } }
        }
    }
    private func finirDictee() {
        dicteeMoteur?.stop(); dicteeMoteur?.inputNode.removeTap(onBus: 0); dicteeMoteur = nil
        dicteeTache?.cancel(); dicteeTache = nil; dicteeDemande = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
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
