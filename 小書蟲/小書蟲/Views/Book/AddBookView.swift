import SwiftUI
import SwiftData
import PhotosUI

struct AddBookView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var searchQuery = ""
    @State private var searchResults: [GoogleBookResult] = []
    @State private var isSearching = false
    @State private var searchError: String?

    @State private var title = ""
    @State private var author = ""
    @State private var publisher = ""
    @State private var category = AppCategory.other.rawValue
    @State private var coverImageData: Data?
    @State private var coverURL: String?

    @State private var photoPickerItem: PhotosPickerItem?
    @State private var showCamera = false

    var body: some View {
        NavigationStack {
            Form {
                searchSection
                infoSection
                coverSection
            }
            .navigationTitle("新增書本")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("儲存") { save() }
                        .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onChange(of: photoPickerItem) { _, newItem in
                Task {
                    if let data = try? await newItem?.loadTransferable(type: Data.self) {
                        coverImageData = data
                        coverURL = nil
                    }
                }
            }
            .sheet(isPresented: $showCamera) {
                CameraPicker { data in
                    coverImageData = data
                    coverURL = nil
                }
                .ignoresSafeArea()
            }
        }
    }

    // MARK: - Sections

    private var searchSection: some View {
        Section {
            HStack {
                TextField("輸入書名或作者", text: $searchQuery)
                    .submitLabel(.search)
                    .onSubmit(performSearch)
                Button {
                    performSearch()
                } label: {
                    if isSearching {
                        ProgressView()
                    } else {
                        Image(systemName: "magnifyingglass")
                    }
                }
                .disabled(searchQuery.isEmpty || isSearching)
            }

            if let err = searchError {
                Text(err).font(.caption).foregroundStyle(.red)
            }

            ForEach(searchResults) { result in
                Button {
                    applyResult(result)
                } label: {
                    HStack(spacing: 12) {
                        AsyncImage(url: result.thumbnailURL.flatMap(URL.init)) { image in
                            image.resizable().scaledToFit()
                        } placeholder: {
                            Color.gray.opacity(0.15)
                        }
                        .frame(width: 40, height: 60)
                        .clipShape(RoundedRectangle(cornerRadius: 4))

                        VStack(alignment: .leading, spacing: 2) {
                            Text(result.title)
                                .font(.subheadline)
                                .foregroundStyle(.primary)
                                .lineLimit(2)
                            if !result.authorString.isEmpty {
                                Text(result.authorString)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                            }
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        } header: {
            Text("搜尋(Google Books)")
        } footer: {
            Text("找不到也沒關係，往下手動填就好")
                .font(.caption2)
        }
    }

    private var infoSection: some View {
        Section("基本資訊") {
            TextField("書名", text: $title)
            TextField("作者", text: $author)
            TextField("出版社", text: $publisher)
            Picker("分類", selection: $category) {
                ForEach(AppCategory.allCases) { cat in
                    Text(cat.rawValue).tag(cat.rawValue)
                }
            }
        }
    }

    private var coverSection: some View {
        Section("封面") {
            if let data = coverImageData, let uiImage = UIImage(data: data) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFit()
                    .frame(maxHeight: 200)
                    .frame(maxWidth: .infinity, alignment: .center)
            } else if let urlString = coverURL, let url = URL(string: urlString) {
                AsyncImage(url: url) { img in
                    img.resizable().scaledToFit()
                } placeholder: {
                    ProgressView()
                }
                .frame(maxHeight: 200)
                .frame(maxWidth: .infinity, alignment: .center)
            }

            PhotosPicker(selection: $photoPickerItem, matching: .images) {
                Label("從相簿選取", systemImage: "photo.on.rectangle")
            }

            Button {
                showCamera = true
            } label: {
                Label("用相機拍封面", systemImage: "camera")
            }
        }
    }

    // MARK: - Actions

    private func performSearch() {
        searchError = nil
        Task {
            isSearching = true
            defer { isSearching = false }
            do {
                searchResults = try await GoogleBooksService.search(query: searchQuery)
                if searchResults.isEmpty {
                    searchError = "沒找到結果，試試別的關鍵字或直接手動填"
                }
            } catch {
                searchResults = []
                searchError = "搜尋失敗：\(error.localizedDescription)"
            }
        }
    }

    private func applyResult(_ result: GoogleBookResult) {
        title = result.title
        author = result.authorString
        publisher = result.publisher
        coverURL = result.thumbnailURL
        coverImageData = nil
    }

    private func save() {
        let book = Book(
            title: title.trimmingCharacters(in: .whitespaces),
            author: author.trimmingCharacters(in: .whitespaces),
            publisher: publisher.trimmingCharacters(in: .whitespaces),
            coverImageData: coverImageData,
            coverURL: coverURL,
            category: category
        )
        modelContext.insert(book)
        dismiss()
    }
}

// MARK: - 相機 Picker

struct CameraPicker: UIViewControllerRepresentable {
    let onCaptured: (Data) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onCaptured: onCaptured)
    }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onCaptured: (Data) -> Void

        init(onCaptured: @escaping (Data) -> Void) {
            self.onCaptured = onCaptured
        }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            if let image = info[.originalImage] as? UIImage,
               let data = image.jpegData(compressionQuality: 0.85) {
                onCaptured(data)
            }
            picker.dismiss(animated: true)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            picker.dismiss(animated: true)
        }
    }
}
