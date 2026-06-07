import SwiftUI
import UIKit

enum ShareCardGenerator {
    /// 月選書分享圖卡(1080x1080，IG 正方形)
    @MainActor
    static func generateMonthlyPickCard(book: Book) -> UIImage? {
        let view = MonthlyPickCardView(book: book)
            .frame(width: 1080, height: 1080)
        let renderer = ImageRenderer(content: view)
        renderer.scale = 1.0
        return renderer.uiImage
    }

    /// 年度回顧分享圖卡(1080x1920，IG Story 直式)
    @MainActor
    static func generateYearlyWrapCard(year: Int, books: [Book]) -> UIImage? {
        let view = YearlyWrapCardView(year: year, books: books)
            .frame(width: 1080, height: 1920)
        let renderer = ImageRenderer(content: view)
        renderer.scale = 1.0
        return renderer.uiImage
    }
}
