import SwiftUI

struct BookCoverCell: View {
    let book: Book

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ZStack(alignment: .topTrailing) {
                cover
                    .aspectRatio(2.0/3.0, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    .shadow(color: .black.opacity(0.15), radius: 4, x: 0, y: 2)

                if book.isMonthlyPick || book.isYearlyPick {
                    Image(systemName: book.isYearlyPick ? "crown.fill" : "star.fill")
                        .font(.caption)
                        .foregroundStyle(.yellow)
                        .padding(6)
                        .background(.ultraThinMaterial, in: Circle())
                        .padding(4)
                }
            }

            Text(book.title)
                .font(.caption)
                .lineLimit(2)
                .foregroundStyle(.primary)
                .multilineTextAlignment(.leading)

            if !book.author.isEmpty {
                Text(book.author)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
    }

    @ViewBuilder
    private var cover: some View {
        if let data = book.coverImageData, let uiImage = UIImage(data: data) {
            Image(uiImage: uiImage)
                .resizable()
        } else if let urlString = book.coverURL, let url = URL(string: urlString) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable()
                case .empty:
                    placeholder.overlay(ProgressView())
                case .failure:
                    placeholder
                @unknown default:
                    placeholder
                }
            }
        } else {
            placeholder
        }
    }

    private var placeholder: some View {
        ZStack {
            Rectangle().fill(Color.brown.opacity(0.15))
            Image(systemName: "book.closed.fill")
                .font(.title)
                .foregroundStyle(.brown.opacity(0.6))
        }
    }
}
