import SwiftUI

// MARK: - 分享頁面(顯示 + 按鈕)

struct ShareCardView: View {
    let book: Book
    @Environment(\.dismiss) private var dismiss
    @State private var renderedImage: UIImage?

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Spacer()
                MonthlyPickCardView(book: book)
                    .frame(width: 320, height: 320)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .shadow(radius: 12)
                Spacer()
                if let image = renderedImage {
                    ShareLink(
                        item: Image(uiImage: image),
                        preview: SharePreview(book.title, image: Image(uiImage: image))
                    ) {
                        Label("分享到 IG / Line", systemImage: "square.and.arrow.up")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.brown)
                    .controlSize(.large)
                    .padding(.horizontal)
                } else {
                    ProgressView()
                        .padding()
                }
            }
            .padding(.bottom)
            .navigationTitle("月選書圖卡")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("關閉") { dismiss() }
                }
            }
            .task {
                renderedImage = ShareCardGenerator.generateMonthlyPickCard(book: book)
            }
        }
    }
}

// MARK: - 月選書圖卡(1080x1080，暖棕色系)

struct MonthlyPickCardView: View {
    let book: Book

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.96, green: 0.90, blue: 0.80),
                    Color(red: 0.78, green: 0.62, blue: 0.45)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            VStack(spacing: 32) {
                Text("本月選書")
                    .font(.system(size: 40, weight: .semibold))
                    .foregroundStyle(Color(red: 0.4, green: 0.25, blue: 0.15))
                    .padding(.top, 20)

                cover
                    .aspectRatio(2.0/3.0, contentMode: .fit)
                    .frame(maxWidth: 380)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .shadow(color: .black.opacity(0.25), radius: 16, x: 0, y: 8)

                VStack(spacing: 10) {
                    Text(book.title)
                        .font(.system(size: 44, weight: .bold))
                        .foregroundStyle(Color(red: 0.25, green: 0.15, blue: 0.08))
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                    if !book.author.isEmpty {
                        Text(book.author)
                            .font(.system(size: 28))
                            .foregroundStyle(Color(red: 0.4, green: 0.28, blue: 0.18))
                    }
                }
                .padding(.horizontal, 40)

                Spacer()

                Text("— 小書蟲 —")
                    .font(.system(size: 22))
                    .foregroundStyle(Color(red: 0.5, green: 0.35, blue: 0.22))
                    .padding(.bottom, 30)
            }
            .padding(.vertical, 40)
        }
    }

    @ViewBuilder
    private var cover: some View {
        if let data = book.coverImageData, let uiImage = UIImage(data: data) {
            Image(uiImage: uiImage).resizable()
        } else if let urlString = book.coverURL, let url = URL(string: urlString) {
            AsyncImage(url: url) { img in
                img.resizable()
            } placeholder: {
                Color.brown.opacity(0.15)
            }
        } else {
            Color.brown.opacity(0.15)
        }
    }
}

// MARK: - 年度回顧圖卡(1080x1920，深色系)

struct YearlyWrapCardView: View {
    let year: Int
    let books: [Book]

    private var categoryCounts: [(String, Int)] {
        Dictionary(grouping: books, by: \.category)
            .map { ($0.key, $0.value.count) }
            .sorted { $0.1 > $1.1 }
    }

    private var yearlyPicks: [Book] {
        books.filter(\.isYearlyPick)
    }

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.12, green: 0.10, blue: 0.18),
                    Color(red: 0.30, green: 0.18, blue: 0.28)
                ],
                startPoint: .top,
                endPoint: .bottom
            )

            VStack(spacing: 40) {
                VStack(spacing: 12) {
                    Text("\(String(year))")
                        .font(.system(size: 80, weight: .heavy))
                        .foregroundStyle(.white)
                    Text("年度閱讀回顧")
                        .font(.system(size: 36, weight: .medium))
                        .foregroundStyle(.white.opacity(0.85))
                }
                .padding(.top, 40)

                Text("讀了 \(books.count) 本書")
                    .font(.system(size: 32))
                    .foregroundStyle(.white.opacity(0.7))

                if !categoryCounts.isEmpty {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("分類分布")
                            .font(.system(size: 24, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.6))
                        ForEach(categoryCounts.prefix(5), id: \.0) { item in
                            HStack {
                                Text(item.0)
                                    .font(.system(size: 28))
                                    .foregroundStyle(.white)
                                Spacer()
                                Text("\(item.1) 本")
                                    .font(.system(size: 28))
                                    .foregroundStyle(.white.opacity(0.7))
                            }
                        }
                    }
                    .padding(40)
                    .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 20))
                    .padding(.horizontal, 60)
                }

                if !yearlyPicks.isEmpty {
                    VStack(spacing: 20) {
                        Text("年度精選")
                            .font(.system(size: 32, weight: .semibold))
                            .foregroundStyle(.white)
                        HStack(spacing: 20) {
                            ForEach(yearlyPicks.prefix(3)) { book in
                                VStack(spacing: 8) {
                                    bookCover(book)
                                        .aspectRatio(2.0/3.0, contentMode: .fit)
                                        .frame(width: 180)
                                        .clipShape(RoundedRectangle(cornerRadius: 10))
                                        .shadow(radius: 10)
                                    Text(book.title)
                                        .font(.system(size: 18))
                                        .foregroundStyle(.white)
                                        .lineLimit(1)
                                        .frame(width: 180)
                                }
                            }
                        }
                    }
                }

                Spacer()

                Text("— 小書蟲 —")
                    .font(.system(size: 26))
                    .foregroundStyle(.white.opacity(0.4))
                    .padding(.bottom, 60)
            }
            .padding(.vertical, 60)
        }
    }

    @ViewBuilder
    private func bookCover(_ book: Book) -> some View {
        if let data = book.coverImageData, let uiImage = UIImage(data: data) {
            Image(uiImage: uiImage).resizable()
        } else if let urlString = book.coverURL, let url = URL(string: urlString) {
            AsyncImage(url: url) { img in
                img.resizable()
            } placeholder: {
                Color.white.opacity(0.1)
            }
        } else {
            Color.white.opacity(0.1)
        }
    }
}
