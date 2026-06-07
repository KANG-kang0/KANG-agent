import Foundation
import SwiftData

@Model
final class Book {
    var id: UUID
    var title: String
    var author: String
    var publisher: String

    /// 使用者自己拍/選的封面(優先顯示)。
    var coverImageData: Data?
    /// 從 Google Books 抓的封面網址(coverImageData 為 nil 時 fallback)。
    var coverURL: String?

    var category: String
    var dateAdded: Date
    var dateFinished: Date?

    var isMonthlyPick: Bool
    var isYearlyPick: Bool

    var aiSummary: String
    /// "bullet" 或 "paragraph"
    var summaryStyle: String

    @Relationship(deleteRule: .cascade, inverse: \BookNote.book)
    var notes: [BookNote] = []

    init(
        id: UUID = UUID(),
        title: String,
        author: String = "",
        publisher: String = "",
        coverImageData: Data? = nil,
        coverURL: String? = nil,
        category: String = "其他",
        dateAdded: Date = Date(),
        dateFinished: Date? = nil,
        isMonthlyPick: Bool = false,
        isYearlyPick: Bool = false,
        aiSummary: String = "",
        summaryStyle: String = "bullet"
    ) {
        self.id = id
        self.title = title
        self.author = author
        self.publisher = publisher
        self.coverImageData = coverImageData
        self.coverURL = coverURL
        self.category = category
        self.dateAdded = dateAdded
        self.dateFinished = dateFinished
        self.isMonthlyPick = isMonthlyPick
        self.isYearlyPick = isYearlyPick
        self.aiSummary = aiSummary
        self.summaryStyle = summaryStyle
    }
}
