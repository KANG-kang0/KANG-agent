import SwiftUI
import SwiftData

struct YearlyWrapView: View {
    @Query(sort: \Book.dateAdded, order: .reverse) private var allBooks: [Book]
    @State private var selectedYear: Int = Calendar.current.component(.year, from: Date())
    @State private var showShareCard = false

    private var booksInYear: [Book] {
        allBooks.filter {
            Calendar.current.component(.year, from: $0.dateAdded) == selectedYear
        }
    }

    private var availableYears: [Int] {
        let years = Set(allBooks.map { Calendar.current.component(.year, from: $0.dateAdded) })
        let withCurrent = years.union([Calendar.current.component(.year, from: Date())])
        return withCurrent.sorted(by: >)
    }

    private var categoryCounts: [(String, Int)] {
        Dictionary(grouping: booksInYear, by: \.category)
            .map { ($0.key, $0.value.count) }
            .sorted { $0.1 > $1.1 }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    yearPicker
                    statCard
                    categoryCard
                    pickedBooksCard
                    shareButton
                }
                .padding()
            }
            .navigationTitle("年度回顧")
            .sheet(isPresented: $showShareCard) {
                YearlyShareSheet(year: selectedYear, books: booksInYear)
            }
        }
    }

    private var yearPicker: some View {
        Picker("年份", selection: $selectedYear) {
            ForEach(availableYears, id: \.self) { y in
                Text(String(y)).tag(y)
            }
        }
        .pickerStyle(.segmented)
    }

    private var statCard: some View {
        HStack(spacing: 20) {
            VStack(alignment: .leading, spacing: 4) {
                Text("\(booksInYear.count)")
                    .font(.system(size: 48, weight: .bold))
                    .foregroundStyle(.brown)
                Text("本書")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Divider().frame(height: 50)
            VStack(alignment: .leading, spacing: 4) {
                Text("\(booksInYear.filter(\.isYearlyPick).count)")
                    .font(.system(size: 48, weight: .bold))
                    .foregroundStyle(.orange)
                Text("年選書")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Divider().frame(height: 50)
            VStack(alignment: .leading, spacing: 4) {
                Text("\(booksInYear.filter(\.isMonthlyPick).count)")
                    .font(.system(size: 48, weight: .bold))
                    .foregroundStyle(.yellow)
                Text("月選書")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding()
        .background(Color.brown.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
    }

    private var categoryCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("分類分布")
                .font(.headline)

            if categoryCounts.isEmpty {
                Text("還沒讀任何書")
                    .foregroundStyle(.secondary)
                    .font(.caption)
            } else {
                ForEach(categoryCounts, id: \.0) { item in
                    HStack {
                        Text(item.0)
                            .font(.subheadline)
                        Spacer()
                        Text("\(item.1) 本")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    if item.0 != categoryCounts.last?.0 {
                        Divider()
                    }
                }
            }
        }
        .padding()
        .background(Color.gray.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
    }

    private var pickedBooksCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("精選書單")
                .font(.headline)

            let picks = booksInYear.filter(\.isYearlyPick)
            if picks.isEmpty {
                Text("還沒標記任何年選書，到書本詳情頁標記吧")
                    .foregroundStyle(.secondary)
                    .font(.caption)
            } else {
                ForEach(picks) { book in
                    HStack(spacing: 12) {
                        Image(systemName: "crown.fill")
                            .foregroundStyle(.orange)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(book.title)
                                .font(.subheadline.weight(.medium))
                            if !book.author.isEmpty {
                                Text(book.author)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        Spacer()
                    }
                }
            }
        }
        .padding()
        .background(Color.gray.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
    }

    private var shareButton: some View {
        Button {
            showShareCard = true
        } label: {
            Label("分享年度回顧", systemImage: "square.and.arrow.up")
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .tint(.brown)
        .controlSize(.large)
        .disabled(booksInYear.isEmpty)
    }
}

// MARK: - 年度回顧分享

struct YearlyShareSheet: View {
    let year: Int
    let books: [Book]
    @Environment(\.dismiss) private var dismiss
    @State private var renderedImage: UIImage?

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Spacer()
                YearlyWrapCardView(year: year, books: books)
                    .frame(width: 300, height: 533)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .shadow(radius: 12)
                Spacer()
                if let image = renderedImage {
                    ShareLink(
                        item: Image(uiImage: image),
                        preview: SharePreview("\(String(year)) 年度回顧", image: Image(uiImage: image))
                    ) {
                        Label("分享到 IG / Line", systemImage: "square.and.arrow.up")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.brown)
                    .controlSize(.large)
                    .padding(.horizontal)
                } else {
                    ProgressView().padding()
                }
            }
            .padding(.bottom)
            .navigationTitle("\(String(year)) 年度回顧")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("關閉") { dismiss() }
                }
            }
            .task {
                renderedImage = ShareCardGenerator.generateYearlyWrapCard(year: year, books: books)
            }
        }
    }
}
