import Foundation
import UIKit

enum ClaudeServiceError: LocalizedError {
    case missingAPIKey
    case invalidResponse
    case apiError(status: Int, message: String)

    var errorDescription: String? {
        switch self {
        case .missingAPIKey:
            return "請先在 Config.swift 填入 Claude API Key"
        case .invalidResponse:
            return "API 回應格式錯誤"
        case .apiError(let status, let message):
            return "API 錯誤(\(status))：\(message)"
        }
    }
}

enum ClaudeService {
    /// 把多張筆記照片送給 Claude，請它整理重點。
    /// - Parameters:
    ///   - images: 每張照片的 JPEG/PNG Data,最多 10 張。
    ///   - style: "bullet"(條列) 或 "paragraph"(段落)。
    ///   - bookTitle: 書名，會放進 prompt 讓摘要更貼題。
    static func summarizeNotes(
        images: [Data],
        style: String,
        bookTitle: String
    ) async throws -> String {
        guard !Config.claudeAPIKey.isEmpty else {
            throw ClaudeServiceError.missingAPIKey
        }
        guard !images.isEmpty else { return "" }

        let url = URL(string: "https://api.anthropic.com/v1/messages")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 90
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(Config.claudeAPIKey, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")

        let styleHint = (style == "paragraph")
            ? "用段落式整理(流暢的短文，3-5 段)"
            : "用條列式整理(每點 1-2 句，5-10 點)"

        let prompt = """
        以下是我讀《\(bookTitle)》時拍下的筆記照片。請幫我用繁體中文整理出這本書的重點。

        要求：
        - \(styleHint)
        - 抓核心觀念，不要照抄
        - 如果照片中有金句，可以保留
        - 語氣自然，像在跟朋友分享
        - 直接給整理結果，不要前後贅言
        """

        // 把照片壓縮一下再送出，省 token 也省頻寬。
        var content: [[String: Any]] = []
        for data in images {
            let compressed = compressIfNeeded(data) ?? data
            let base64 = compressed.base64EncodedString()
            content.append([
                "type": "image",
                "source": [
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": base64
                ]
            ])
        }
        content.append(["type": "text", "text": prompt])

        let body: [String: Any] = [
            "model": Config.claudeModel,
            "max_tokens": 1500,
            "messages": [
                ["role": "user", "content": content]
            ]
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw ClaudeServiceError.invalidResponse
        }
        if http.statusCode != 200 {
            let message = String(data: data, encoding: .utf8) ?? "unknown"
            throw ClaudeServiceError.apiError(status: http.statusCode, message: message)
        }

        let decoded = try JSONDecoder().decode(MessagesResponse.self, from: data)
        return decoded.content
            .compactMap { $0.text }
            .joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// 如果照片長邊 > 1600px 就縮一下，省 token。
    private static func compressIfNeeded(_ data: Data) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        let maxSide: CGFloat = 1600
        let longest = max(image.size.width, image.size.height)
        guard longest > maxSide else {
            return image.jpegData(compressionQuality: 0.8)
        }
        let scale = maxSide / longest
        let newSize = CGSize(
            width: image.size.width * scale,
            height: image.size.height * scale
        )
        let renderer = UIGraphicsImageRenderer(size: newSize)
        let resized = renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: newSize))
        }
        return resized.jpegData(compressionQuality: 0.75)
    }
}

private struct MessagesResponse: Decodable {
    struct ContentBlock: Decodable {
        let type: String
        let text: String?
    }
    let content: [ContentBlock]
}
