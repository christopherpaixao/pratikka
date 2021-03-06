import { Component, OnInit } from '@angular/core';
import { MediaCapture, MediaFile, CaptureError, CaptureAudioOptions } from '@ionic-native/media-capture/ngx';
import { OverlayService } from 'src/app/core/services/overlay.service';
import { File, FileEntry } from '@ionic-native/File/ngx';
import { Platform, ActionSheetController } from '@ionic/angular';
import { StreamingMedia } from '@ionic-native/streaming-media/ngx';
import { AngularFireStorage } from '@angular/fire/storage';
import { AuthService } from 'src/app/core/services/auth.service';
import { CrudService } from 'src/app/core/services/crud.service';
import { Media, MediaObject } from '@ionic-native/media/ngx';

const MEDIA_FOLDER_NAME = 'prattika_audios';

@Component({
  selector: 'app-podcast',
  templateUrl: './podcast.page.html',
  styleUrls: ['./podcast.page.scss'],
})
export class PodcastPage implements OnInit {
  user: firebase.User;
  arquivos = [];
  audioFullPath = "";
  urlDownloadAudio = "";


  constructor(
    private auth: AuthService,
    private mediaCapture: MediaCapture,
    private overlay: OverlayService,
    private file: File,
    private plt: Platform,
    private acoes: ActionSheetController,
    private play: StreamingMedia,
    private storage: AngularFireStorage,
    private crud: CrudService,
    private media: Media
  ) {
    this.auth.authState$.subscribe(user => (this.user = user));
  }

  ngOnInit(): void {
    this.plt.ready().then(() => {
      let path = this.file.externalApplicationStorageDirectory;
      this.file.checkDir(path, MEDIA_FOLDER_NAME).then(
        () => {
          this.carregarArquivos();
        },
        err => {
          this.file.createDir(path, MEDIA_FOLDER_NAME, false);
        }
      );
    });
  }

  carregarArquivos() {
    this.file.listDir(this.file.externalApplicationStorageDirectory, MEDIA_FOLDER_NAME).then(
      res => {
        this.arquivos = res;
      },
      err => console.log('error loading files: ', err)
    );
  }

  capturarAudio() {
    this.mediaCapture.captureAudio().then((audio: MediaFile[]) => {
      this.copiarParaDiretorioLocal(audio[0].fullPath);
    })
  }

  copiarParaDiretorioLocal(fullPath) {
    let myPath = fullPath;
    // Make sure we copy from the right location
    if (fullPath.indexOf('file://') < 0) {
      myPath = 'file://' + fullPath;
    }

    const ext = myPath.split('.').pop();
    const d = Date.now();
    const newName = `${d}.${ext}`;

    const name = myPath.substr(myPath.lastIndexOf('/') + 1);
    const copyFrom = myPath.substr(0, myPath.lastIndexOf('/') + 1);
    const copyTo = this.file.externalApplicationStorageDirectory + MEDIA_FOLDER_NAME;

    this.file.resolveLocalFilesystemUrl(copyFrom + name).then(
      (entry: any) => {
        console.log('entry', entry);

        this.file.resolveLocalFilesystemUrl(copyTo).then(
          (dirEntry: any) => {
            entry.copyTo(dirEntry, newName);
            this.carregarArquivos();
          }).catch(error => console.log(error))
      }).catch(error => console.log(error));
  }

  async postarAudio(titulo: any, arquivo: FileEntry) {
    const loading = await this.overlay.loading();
    loading.present();
    const path = arquivo.nativeURL.substr(0, arquivo.nativeURL.lastIndexOf('/') + 1);
    const type = this.getMimeType(arquivo.name.split('.').pop());
    const buffer = await this.file.readAsArrayBuffer(path, arquivo.name);
    const fileBlob = new Blob([buffer], type);

    const randomId = Math.random()
      .toString(36)
      .substring(2, 8);
    try {

      const ref = this.storage.ref(
        'prattika/' + this.user.uid + '/audios/' + randomId + new Date().getTime() + '.mp3'
      );

      await ref.put(fileBlob).then(snapshot => {
        this.audioFullPath = snapshot.metadata.fullPath;
      }).then(async () => {
        await ref.getDownloadURL().toPromise().then(url =>
          this.urlDownloadAudio = url
        )
      })

      let dados = {
        titulo: titulo,
        urlDownload: this.urlDownloadAudio,
        fullPath: this.audioFullPath,
        id_usuario: this.user.uid,
        nomeUsuario: this.user.displayName
      }

      this.crud.novaPostagemMidiaAudio(dados);
      this.removerAudio(arquivo);

      this.overlay.toast({
        message: 'Podcast postado!',
        buttons: [
          {
            text: 'OK'
          }
        ]
      })

    } catch (e) {
      this.overlay.alert({
        message: e,
        buttons: ["OK"]
      })
    } finally {
      loading.dismiss();
    }

  }

  getMimeType(fileExt) {
    if (fileExt == 'wav') return { type: 'audio/wav' };
    else if (fileExt == 'jpg') return { type: 'image/jpg' };
    else if (fileExt == 'mp4') return { type: 'video/mp4' };
    else if (fileExt == 'MOV') return { type: 'video/quicktime' };
  }

  removerAudio(arquivo: FileEntry) {
    const path = arquivo.nativeURL.substr(0, arquivo.nativeURL.lastIndexOf('/') + 1);
    this.file.removeFile(path, arquivo.name).then(() => {
      this.carregarArquivos();
    }, err => console.log('error remove: ', err));
  }

  async folhaAcoes(arquivo: FileEntry) {
    const acao = await this.acoes.create({
      header: arquivo.name,
      buttons: [{
        text: 'Ouvir Áudio',
        icon: 'play-sharp',
        handler: () => {
          this.play.playAudio(arquivo.nativeURL)
        }
      },
      {
        text: 'Postar',
        icon: 'arrow-up',
        handler: () => {
          console.log('Postar Áudio')
          //this.postarVideo(arquivo);
          this.overlay.alert({
            header: 'Insira um título',
            inputs: [
              {
                name: 'titulo',
                type: 'text'
              }
            ],
            buttons: [
              {
                text: 'Cancelar',
                role: 'cancel',
                cssClass: 'secondary'
              },
              {
                text: 'Prosseguir',
                handler: (data) => {
                  this.postarAudio(data.titulo, arquivo)
                }
              }
            ]
          });
        }
      },
      {
        text: 'Remover Áudio',
        role: 'destructive',
        icon: 'trash',
        handler: () => {
          this.removerAudio(arquivo);
        }
      },
      {
        text: 'Cancelar',
        icon: 'close',
        role: 'cancel',
        handler: () => {
          console.log('Cancel clicked');
        }
      }
      ]
    });
    await acao.present();
  }


}
