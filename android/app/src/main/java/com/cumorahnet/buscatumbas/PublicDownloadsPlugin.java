package com.cumorahnet.buscatumbas;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.concurrent.ConcurrentHashMap;

@CapacitorPlugin(name = "PublicDownloads")
public class PublicDownloadsPlugin extends Plugin {
    private static final int MAX_BYTES = 8 * 1024 * 1024;
    private final ConcurrentHashMap<String, String> savedFiles = new ConcurrentHashMap<>();

    @PluginMethod
    public void saveFile(PluginCall call) {
        try {
            String filename = call.getString("filename", "");
            String mime = call.getString("mimeType", "");
            if (!filename.matches("[a-zA-Z0-9][a-zA-Z0-9._-]{0,160}") ||
                !(mime.equals("image/jpeg") && filename.endsWith(".jpg") ||
                  mime.equals("image/png") && filename.endsWith(".png") ||
                  mime.equals("image/webp") && filename.endsWith(".webp") ||
                  mime.equals("text/plain") && filename.endsWith(".txt"))) {
                throw new IllegalArgumentException("Invalid filename or type");
            }
            String encoded = call.getString("data", "");
            if (encoded.length() > (MAX_BYTES * 4 / 3) + 8) throw new IllegalArgumentException("File too large");
            byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
            if (bytes.length == 0 || bytes.length > MAX_BYTES) throw new IllegalArgumentException("Invalid file size");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                execute(() -> saveToDownloads(call, filename, mime, bytes));
            } else {
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(mime);
                intent.putExtra(Intent.EXTRA_TITLE, filename);
                startActivityForResult(call, intent, "fileSelected");
            }
        } catch (Exception error) {
            call.reject("No se pudo preparar el archivo para guardar.", "SAVE_FAILED");
        }
    }

    private void saveToDownloads(PluginCall call, String filename, String mime, byte[] bytes) {
        ContentResolver resolver = getContext().getContentResolver();
        Uri uri = null;
        try {
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Busca Tumbas");
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new Exception("Cannot create download");
            writeAndVerify(uri, bytes);
            values.clear();
            values.put(MediaStore.MediaColumns.IS_PENDING, 0);
            if (resolver.update(uri, values, null, null) != 1) throw new Exception("Cannot publish download");
            resolveSaved(call, uri, mime, bytes.length, "Descargas/Busca Tumbas/");
        } catch (Exception error) {
            if (uri != null) {
                try { resolver.delete(uri, null, null); } catch (Exception ignored) {}
            }
            call.reject("No se pudo guardar el archivo en Descargas. Comprueba el espacio disponible.", "SAVE_FAILED");
        }
    }

    @ActivityCallback
    private void fileSelected(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("Guardado cancelado.", "SAVE_CANCELLED");
            return;
        }
        Uri uri = result.getData().getData();
        execute(() -> {
            try {
                byte[] bytes = Base64.decode(call.getString("data", ""), Base64.DEFAULT);
                writeAndVerify(uri, bytes);
                resolveSaved(call, uri, call.getString("mimeType", ""), bytes.length, "Ubicacion elegida/");
            } catch (Exception error) {
                try { getContext().getContentResolver().delete(uri, null, null); } catch (Exception ignored) {}
                call.reject("No se pudo completar el guardado.", "SAVE_FAILED");
            }
        });
    }

    private void writeAndVerify(Uri uri, byte[] bytes) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        try (OutputStream output = resolver.openOutputStream(uri, "w")) {
            if (output == null) throw new Exception("No output stream");
            output.write(bytes);
            output.flush();
        }
        MessageDigest actual = MessageDigest.getInstance("SHA-256");
        long size = 0;
        try (InputStream input = resolver.openInputStream(uri)) {
            if (input == null) throw new Exception("No input stream");
            byte[] buffer = new byte[16384];
            int length;
            while ((length = input.read(buffer)) != -1) {
                size += length;
                actual.update(buffer, 0, length);
            }
        }
        if (size != bytes.length || !Arrays.equals(actual.digest(), MessageDigest.getInstance("SHA-256").digest(bytes))) {
            throw new Exception("Saved file verification failed");
        }
    }

    private void resolveSaved(PluginCall call, Uri uri, String mime, int size, String folder) throws Exception {
        String name;
        try (Cursor cursor = getContext().getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor == null || !cursor.moveToFirst()) throw new Exception("Saved file not found");
            name = cursor.getString(0);
        }
        savedFiles.put(uri.toString(), mime);
        JSObject saved = new JSObject();
        saved.put("filename", name);
        saved.put("path", folder + name);
        saved.put("uri", uri.toString());
        saved.put("bytes", size);
        call.resolve(saved);
    }

    @PluginMethod
    public void openFile(PluginCall call) {
        String uri = call.getString("uri", "");
        String mime = savedFiles.get(uri);
        if (mime == null) { call.reject("Vuelve a descargar la fotografia para abrirla.", "FILE_NOT_FOUND"); return; }
        getActivity().runOnUiThread(() -> {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(Uri.parse(uri), mime);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                getActivity().startActivity(Intent.createChooser(intent, "Abrir archivo guardado"));
                call.resolve();
            } catch (Exception error) { call.reject("No hay una aplicacion disponible para abrir este archivo.", "OPEN_FAILED"); }
        });
    }
}
