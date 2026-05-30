import Foundation
import SwiftData

@Model
final class BookNote {
    var id: UUID
    var imageData: Data
    var dateAdded: Date
    var book: Book?

    init(
        id: UUID = UUID(),
        imageData: Data,
        dateAdded: Date = Date(),
        book: Book? = nil
    ) {
        self.id = id
        self.imageData = imageData
        self.dateAdded = dateAdded
        self.book = book
    }
}
