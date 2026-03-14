import { Component } from '@angular/core';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { ConversionService } from '../services/conversion.service';

@Component({
  selector: 'app-frontend',
  imports: [
    NzGridModule,
  ],
  templateUrl: './frontend.component.html',
  styleUrl: './frontend.component.scss',
})

export class FrontendComponent {
  itemCountH = 2;
  itemCountV = 2;

  constructor(
    public convert: ConversionService,
  ) { }

}

