import Foundation
import Capacitor
import CryptoKit
import QuickLook

@objc(PublicDownloadsPlugin)
public class PublicDownloadsPlugin: CAPPlugin, CAPBridgedPlugin, QLPreviewControllerDataSource {
    public let identifier = "PublicDownloadsPlugin"
    public let jsName = "PublicDownloads"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "saveFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openFile", returnType: CAPPluginReturnPromise)
    ]
    private var savedFiles: [String: URL] = [:]
    private var previewURL: URL?

    @objc func saveFile(_ call: CAPPluginCall) {
        guard let filename = call.getString("filename"),
              filename.range(of: "^[A-Za-z0-9][A-Za-z0-9._-]{0,160}$", options: .regularExpression) != nil,
              let encoded = call.getString("data"), encoded.count <= 12 * 1024 * 1024,
              let data = Data(base64Encoded: encoded, options: .ignoreUnknownCharacters),
              !data.isEmpty, data.count <= 8 * 1024 * 1024,
              let mime = call.getString("mimeType"),
              ["image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"][mime] == (filename as NSString).pathExtension else {
            call.reject("Archivo no valido para guardar.", "SAVE_FAILED")
            return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            var destination: URL?
            do {
                let files = FileManager.default
                let documents = try files.url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
                let folder = documents.appendingPathComponent("FamilySearch", isDirectory: true)
                try files.createDirectory(at: folder, withIntermediateDirectories: true)
                let stem = (filename as NSString).deletingPathExtension
                let ext = (filename as NSString).pathExtension
                var file = folder.appendingPathComponent(filename)
                var suffix = 1
                while files.fileExists(atPath: file.path) {
                    file = folder.appendingPathComponent("\(stem)-\(suffix).\(ext)")
                    suffix += 1
                }
                destination = file
                try data.write(to: file, options: .atomic)
                let saved = try Data(contentsOf: file)
                guard saved.count == data.count, SHA256.hash(data: saved) == SHA256.hash(data: data) else {
                    throw CocoaError(.fileWriteUnknown)
                }
                DispatchQueue.main.async {
                    self.savedFiles[file.absoluteString] = file
                    call.resolve(["uri": file.absoluteString,
                                  "filename": file.lastPathComponent,
                                  "path": "Archivos/En mi iPhone/Busca Tumbas/FamilySearch/" + file.lastPathComponent,
                                  "bytes": saved.count])
                }
            } catch {
                if let file = destination { try? FileManager.default.removeItem(at: file) }
                call.reject("No se pudo guardar la fotografia. Comprueba el espacio disponible.", "SAVE_FAILED")
            }
        }
    }

    @objc func openFile(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let uri = call.getString("uri"), let file = self.savedFiles[uri],
                  FileManager.default.fileExists(atPath: file.path), let controller = self.bridge?.viewController else {
                call.reject("Vuelve a descargar la fotografia para abrirla.", "FILE_NOT_FOUND")
                return
            }
            self.previewURL = file
            let preview = QLPreviewController()
            preview.dataSource = self
            controller.present(preview, animated: true) { call.resolve() }
        }
    }

    public func numberOfPreviewItems(in controller: QLPreviewController) -> Int { previewURL == nil ? 0 : 1 }
    public func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
        return previewURL! as NSURL
    }
}
