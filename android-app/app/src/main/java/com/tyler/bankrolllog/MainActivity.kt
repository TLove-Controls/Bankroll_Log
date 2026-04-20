package com.tyler.bankrolllog

import android.content.pm.ApplicationInfo
import android.annotation.SuppressLint
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.addCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.tyler.bankrolllog.databinding.ActivityMainBinding
import java.io.IOException

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null

    private val fileChooserLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = fileChooserCallback ?: return@registerForActivityResult
            val uris = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
            callback.onReceiveValue(uris)
            fileChooserCallback = null
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        configureWebView(binding.webView)

        onBackPressedDispatcher.addCallback(this) {
            if (binding.webView.canGoBack()) {
                binding.webView.goBack()
            } else {
                finish()
            }
        }

        if (savedInstanceState != null) {
            binding.webView.restoreState(savedInstanceState)
        } else {
            binding.webView.loadUrl("file:///android_asset/index.html")
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        binding.webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView(webView: WebView) {
        val isDebuggable = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        WebView.setWebContentsDebuggingEnabled(isDebuggable)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            useWideViewPort = true
            loadWithOverviewMode = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }

        webView.addJavascriptInterface(AndroidStorageBridge(), "AndroidStorageBridge")

        webView.webViewClient = object : WebViewClient() {}
        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                if (filePathCallback == null || fileChooserParams == null) {
                    return false
                }

                fileChooserCallback?.onReceiveValue(null)
                fileChooserCallback = filePathCallback

                return try {
                    val chooserIntent = fileChooserParams.createIntent().apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "application/json"
                    }
                    fileChooserLauncher.launch(chooserIntent)
                    true
                } catch (_: Exception) {
                    fileChooserCallback = null
                    showToast("Could not open file picker.")
                    false
                }
            }
        }
    }

    private fun showToast(message: String) {
        runOnUiThread {
            Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
        }
    }

    @Suppress("unused")
    inner class AndroidStorageBridge {
        private val stateFile by lazy { java.io.File(filesDir, "bankroll-state.json") }

        @JavascriptInterface
        fun loadState(): String {
            return try {
                if (!stateFile.exists()) {
                    DEFAULT_STATE_JSON
                } else {
                    stateFile.readText()
                }
            } catch (_: Exception) {
                DEFAULT_STATE_JSON
            }
        }

        @JavascriptInterface
        fun saveState(stateJson: String): Boolean {
            return try {
                stateFile.writeText(stateJson)
                true
            } catch (_: Exception) {
                false
            }
        }

        @JavascriptInterface
        fun exportState(stateJson: String, filename: String): Boolean {
            return try {
                writeExportToDownloads(filename, stateJson)
                showToast("Exported JSON to Downloads/Bankroll Log")
                true
            } catch (_: Exception) {
                false
            }
        }

        private fun writeExportToDownloads(filename: String, content: String) {
            val contentValues = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                put(MediaStore.MediaColumns.MIME_TYPE, "application/json")
            }

            val collection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                contentValues.put(
                    MediaStore.MediaColumns.RELATIVE_PATH,
                    Environment.DIRECTORY_DOWNLOADS + "/Bankroll Log"
                )
                MediaStore.Downloads.EXTERNAL_CONTENT_URI
            } else {
                @Suppress("DEPRECATION")
                MediaStore.Files.getContentUri("external")
            }

            val resolver = contentResolver
            val downloadUri = resolver.insert(collection, contentValues)
                ?: throw IOException("Could not create export file.")

            resolver.openOutputStream(downloadUri)?.use { output ->
                output.write(content.toByteArray())
            } ?: throw IOException("Could not write export file.")
        }
    }

    companion object {
        private const val DEFAULT_STATE_JSON =
            """{"bets":[],"lessons":[],"startingBankroll":86.12,"goalBankroll":600}"""
    }
}
