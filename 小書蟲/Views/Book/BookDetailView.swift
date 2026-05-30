import SwiftUI
import SwiftData

struct BookDetailView: View {
    @Bindable var book: Book
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var showShareCard = false
    @State private var isSummarizing = false
    @State private var summaryError: String?
    @State private var showDeleteConfirm = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                pickToggles
                Divider()
                infoSection
                Divider()
                notesSection
                Divider()
                summarySection
            }
            .padding()
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        showShareCard = true
                    } label: {
                        Label("分享圖卡", systemImage: "square.and.arrow.up")
                    }
                    Button(role: .destructive) {
                        showDeleteConfirm = true
                    } label: {
                        Label("刪除書本", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .sheet(isPresented: $showShareCard) {
            ShareCardView(book: book)
        }
        .confirmationDialog("確定要刪除？", isPresented: $showDeleteConfirm) {
            Button("刪除", role: .destructive) {
                modelContext.delete(book)
                dismiss()
            }
            Button("取消", role: .cancel) {}
        } message: {
            Text("這本書與所有筆記照片都會被刪除，無法復原。")
        }
    }

    // MARK: - Sections

    private var header: some View {
        HStack(alignment: .top, spacing: 16) {
            cover
                .aspectRatio(2.0/3.0, contentMode: .fit)
                .frame(width: 120)
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .shadow(color: .black.opacity(0.15), radius: 4, x: 0, y: 2)

            VStack(alignment: .leading, spacing: 6) {
                Text(book.title)
                    .font(.title3.bold())
                if !book.author.isEmpty {
                    Text(book.author)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                if !book.publisher.isEmpty {
                    Text(book.publisher)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                Text("加入於 \(book.dateAdded.formatted(date: .abbreviated, time: .omitted))")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            Spacer()
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
            ZStack {
                Color.brown.opacity(0.15)
                Image(systemName: "book.closed.fill")
                    .foregroundStyle(.brown.opacity(0.6))
            }
        }
    }

    private var pickToggles: some View {
        HStack(spacing: 12) {
            Toggle(isOn: $book.isMonthlyPick) {
                Label("月選書", systemImage: "star")
            }
            .toggleStyle(.button)
            .tint(.yellow)

            Toggle(isOn: $book.isYearlyPick) {
                Label("年選書", systemImage: "crown")
            }
            .toggleStyle(.button)
            .tint(.orange)

            Spacer()
        }
    }

    private var infoSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("分類")
                    .font(.subheadline)
                Spacer()
                Picker("", selection: $book.category) {
                    ForEach(AppCategory.allCases) { cat in
                        Text(cat.rawValue).tag(cat.rawValue)
                    }
                }
            }
        }
    }

    private var notesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("筆記")
                .font(.headline)
            NotesView(book: book)
        }
    }

    private var summarySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("AI 重點整理")
                    .font(.headline)
                Spacer()
                Picker("", selection: $book.summaryStyle) {
                    Text("條列").tag("bullet")
                    Text("段落").tag("paragraph")
                }
                .pickerStyle(.segmented)
                .frame(width: 140)
            }

            if isSummarizing {
                HStack {
                    ProgressView()
                    Text("AI 整理中…")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 8)
            } else if !book.aiSummary.isEmpty {
                Text(book.aiSummary)
                    .font(.body)
                    .textSelection(.enabled)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.brown.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
            } else {
                Text("拍完筆記後，按下方按鈕請 AI 幫你整理重點")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let err = summaryError {
                Text(err)
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            Button {
                summarize()
            } label: {
                Label(
                    book.aiSummary.isEmpty ? "請 AI 整理" : "重新整理",
                    systemImage: "sparkles"
                )
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(.brown)
            .disabled(book.notes.isEmpty || isSummarizing)

            if book.notes.isEmpty {
                Text("需要先加入至少一張筆記照片")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - Actions

    private func summarize() {
        Task {
            isSummarizing = true
            summaryError = nil
            defer { isSummarizing = false }
            do {
                let images = book.notes
                    .sorted { $0.dateAdded < $1.dateAdded }
                    .map(\.imageData)
                let result = try await ClaudeService.summarizeNotes(
                    images: images,
                    style: book.summaryStyle,
                    bookTitle: book.title
                )
                book.aiSummary = result
            } catch {
                summaryError = error.localizedDescription
            }
        }
    }
}
