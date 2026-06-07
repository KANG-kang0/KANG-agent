import Foundation

struct GoogleBookResult: Identifiable, Hashable {
    let id: String
    let title: String
    let authors: [String]
    let publisher: String
    let thumbnailURL: String?

    var authorString: String { authors.joined(separator: ", ") }
}

enum GoogleBooksService {
    /// 搜尋 Google Books，預設偏向中文書。
    static func search(query: String) async throws -> [GoogleBookResult] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty,
              let encoded = trimmed.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: "\(Config.googleBooksAPI)?q=\(encoded)&maxResults=20&langRestrict=zh")
        else { return [] }

        let (data, _) = try await URLSession.shared.data(from: url)
        let response = try JSONDecoder().decode(GoogleBooksResponse.self, from: data)

        return (response.items ?? []).compactMap { item in
            guard let info = item.volumeInfo, let title = info.title else { return nil }
            // Google Books 的 thumbnail 是 http://，iOS ATS 會擋，改成 https。
            let thumbnail = info.imageLinks?.thumbnail?
                .replacingOccurrences(of: "http://", with: "https://")
            return GoogleBookResult(
                id: item.id,
                title: title,
                authors: info.authors ?? [],
                publisher: info.publisher ?? "",
                thumbnailURL: thumbnail
            )
        }
    }

    /// 下載封面圖檔的二進位資料。
    static func downloadCover(from urlString: String) async -> Data? {
        guard let url = URL(string: urlString) else { return nil }
        return try? await URLSession.shared.data(from: url).0
    }
}

// MARK: - Google Books JSON

private struct GoogleBooksResponse: Decodable {
    let items: [VolumeItem]?
}

private struct VolumeItem: Decodable {
    let id: String
    let volumeInfo: VolumeInfo?
}

private struct VolumeInfo: Decodable {
    let title: String?
    let authors: [String]?
    let publisher: String?
    let imageLinks: ImageLinks?
}

private struct ImageLinks: Decodable {
    let thumbnail: String?
}
