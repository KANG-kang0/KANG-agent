import Foundation

/// 預設分類。
///
/// 使用者可以在 BookDetailView 自由選擇，未來若要支援
/// 自定義分類，把這個 enum 的 rawValue 存到 SwiftData 即可。
enum AppCategory: String, CaseIterable, Identifiable {
    case business = "商業"
    case novel = "小說"
    case psychology = "心理"
    case selfHelp = "自我成長"
    case biography = "傳記"
    case science = "科學"
    case other = "其他"

    var id: String { rawValue }

    static var allValues: [String] {
        allCases.map { $0.rawValue }
    }
}
