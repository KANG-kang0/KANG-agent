import SwiftUI
import SwiftData

struct BookshelfView: View {
    @Query(sort: \Book.dateAdded, order: .reverse) private var allBooks: [Book]
    @State private var selectedYear: Int = Calendar.current.component(.year, from: Date())
    @State private var selectedCategory: String = "全部"
    @State private var showAddBook = false

    private var availableYears: [Int] {
        let years = Set(allBooks.map { Calendar.current.component(.year, from: $0.dateAdded) })
        let withCurrent = years.union([Calendar.current.component(.year, from: Date())])
        return withCurrent.sorted(by: >)
    }

    private var filteredBooks: [Book] {
        allBooks.filter { book in
            let yearMatch = Calendar.current.component(.year, from: book.dateAdded) == selectedYear
            let categoryMatch = selectedCategory == "全部" || book.category == selectedCategory
            return yearMatch && categoryMatch
        }
    }

    private let columns = [GridItem(.adaptive(minimum: 100), spacing: 16)]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                yearPicker
                    .padding(.vertical, 8)
                categoryFilter
                    .padding(.bottom, 8)
                Divider()
                if filteredBooks.isEmpty {
                    emptyState
                } else {
                    booksGrid
                }
            }
            .navigationTitle("小書蟲")
            .navigationDestination(for: Book.self) { book in
                BookDetailView(book: book)
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showAddBook = true
                    } label: {
                        Image(systemName: "plus.circle.fill")
                            .font(.title3)
                    }
                }
            }
            .sheet(isPresented: $showAddBook) {
                AddBookView()
            }
        }
    }

    private var yearPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(availableYears, id: \.self) { year in
                    Button {
                        selectedYear = year
                    } label: {
                        Text(String(year))
                            .font(.subheadline.weight(selectedYear == year ? .bold : .regular))
                            .foregroundStyle(selectedYear == year ? .primary : .secondary)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 6)
                            .background(
                                selectedYear == year
                                    ? Color.brown.opacity(0.2)
                                    : Color.clear,
                                in: Capsule()
                            )
                    }
                }
            }
            .padding(.horizontal)
        }
    }

    private var categoryFilter: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                CategoryChip(
                    label: "全部",
                    isSelected: selectedCategory == "全部"
                ) { selectedCategory = "全部" }

                ForEach(AppCategory.allCases) { cat in
                    CategoryChip(
                        label: cat.rawValue,
                        isSelected: selectedCategory == cat.rawValue
                    ) { selectedCategory = cat.rawValue }
                }
            }
            .padding(.horizontal)
        }
    }

    private var booksGrid: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 24) {
                ForEach(filteredBooks) { book in
                    NavigationLink(value: book) {
                        BookCoverCell(book: book)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding()
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "books.vertical")
                .font(.system(size: 56))
                .foregroundStyle(.brown.opacity(0.4))
            Text("還沒有書")
                .font(.headline)
                .foregroundStyle(.secondary)
            Text("按右上角 + 新增第一本書")
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }
}

struct CategoryChip: View {
    let label: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.caption.weight(isSelected ? .semibold : .regular))
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(isSelected ? Color.brown : Color.gray.opacity(0.15))
                .foregroundStyle(isSelected ? .white : .primary)
                .clipShape(Capsule())
        }
    }
}

#Preview {
    BookshelfView()
        .modelContainer(for: [Book.self, BookNote.self], inMemory: true)
}
